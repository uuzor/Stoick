#![cfg(test)]

extern crate std;
use std::vec::Vec as StdVec;

use soroban_poseidon::{poseidon2_hash, Field};
use soroban_sdk::{
    contract, contracterror, contractimpl,
    crypto::BnScalar,
    testutils::Address as _,
    token::{StellarAssetClient, TokenClient},
    Address, Bytes, BytesN, Env, Vec as SorobanVec, U256,
};

use crate::merkle::TREE_DEPTH;
use crate::types::WraithError;
use crate::{WraithPool, WraithPoolClient};

const PROOF_BYTES: usize = 456 * 32;

#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum MockErr {
    Rejected = 1,
}

#[contract]
pub struct MockVerifierOk;

#[contractimpl]
impl MockVerifierOk {
    pub fn verify_proof(_e: Env, _public_inputs: Bytes, _proof: Bytes) -> Result<(), MockErr> {
        Ok(())
    }
}

#[contract]
pub struct MockVerifierFail;

#[contractimpl]
impl MockVerifierFail {
    pub fn verify_proof(_e: Env, _public_inputs: Bytes, _proof: Bytes) -> Result<(), MockErr> {
        Err(MockErr::Rejected)
    }
}

fn be(x: u64) -> [u8; 32] {
    let mut a = [0u8; 32];
    a[24..32].copy_from_slice(&x.to_be_bytes());
    a
}

fn f(env: &Env, x: u64) -> BytesN<32> {
    BytesN::from_array(env, &be(x))
}

fn zero(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[0u8; 32])
}

fn proof(env: &Env) -> Bytes {
    Bytes::from_slice(env, &[0u8; PROOF_BYTES])
}

fn pub_inputs(env: &Env, fields: &[BytesN<32>]) -> Bytes {
    let mut b = Bytes::new(env);
    for field in fields {
        b.extend_from_array(&field.to_array());
    }
    b
}

struct Ctx {
    env: Env,
    client: WraithPoolClient<'static>,
    pool: Address,
    asset: Address,
    user: Address,
}

fn setup(ok: bool) -> Ctx {
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().budget().reset_unlimited();

    let verifier = if ok {
        env.register(MockVerifierOk, ())
    } else {
        env.register(MockVerifierFail, ())
    };
    let pool = env.register(
        WraithPool,
        (
            verifier.clone(),
            verifier.clone(),
            verifier.clone(),
            verifier.clone(),
            verifier.clone(),
        ),
    );
    let client = WraithPoolClient::new(&env, &pool);

    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin);
    let asset = sac.address();
    let user = Address::generate(&env);
    StellarAssetClient::new(&env, &asset).mint(&user, &1_000i128);

    Ctx {
        env,
        client,
        pool,
        asset,
        user,
    }
}

// --- Independent frontier-root reference (mirrors the SHARED §5 algorithm) ---

fn ref_hash2(env: &Env, a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
    let modulus = <BnScalar as Field>::modulus(env);
    let mut inputs = SorobanVec::new(env);
    inputs.push_back(U256::from_be_bytes(env, &Bytes::from_array(env, a)).rem_euclid(&modulus));
    inputs.push_back(U256::from_be_bytes(env, &Bytes::from_array(env, b)).rem_euclid(&modulus));
    let out = poseidon2_hash::<4, BnScalar>(env, &inputs);
    let mut o = [0u8; 32];
    out.to_be_bytes().copy_into_slice(&mut o);
    o
}

fn ref_zero(env: &Env, level: u32) -> [u8; 32] {
    let mut z = [0u8; 32];
    for _ in 0..level {
        let zz = z;
        z = ref_hash2(env, &zz, &zz);
    }
    z
}

fn ref_root(env: &Env, leaves: &[[u8; 32]], depth: u32) -> [u8; 32] {
    let mut frontier: StdVec<Option<[u8; 32]>> = std::vec![None; depth as usize];
    let mut root = ref_zero(env, depth);
    for (i, leaf) in leaves.iter().enumerate() {
        let idx = i as u32;
        let mut cur = *leaf;
        for level in 0..depth {
            let bit = (idx >> level) & 1;
            if bit == 0 {
                frontier[level as usize] = Some(cur);
                cur = ref_hash2(env, &cur, &ref_zero(env, level));
            } else {
                let left = frontier[level as usize]
                    .unwrap_or_else(|| ref_zero(env, level));
                cur = ref_hash2(env, &left, &cur);
            }
        }
        root = cur;
    }
    root
}

#[test]
fn merkle_root_matches_reference() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    let v = Address::generate(&env);
    let pool = env.register(
        WraithPool,
        (v.clone(), v.clone(), v.clone(), v.clone(), v.clone()),
    );

    let mut leaves: StdVec<[u8; 32]> = StdVec::new();
    for i in 0u64..8 {
        leaves.push(ref_hash2(&env, &be(i), &be(i + 100)));
    }

    for (n, leaf) in leaves.iter().enumerate() {
        let leaf_bytes = BytesN::from_array(&env, leaf);
        env.as_contract(&pool, || {
            crate::merkle::insert(&env, &leaf_bytes);
        });
        let onchain = env.as_contract(&pool, || crate::merkle::last_root(&env));
        let expected = ref_root(&env, &leaves[0..=n], TREE_DEPTH);
        assert_eq!(onchain, BytesN::from_array(&env, &expected));
    }
}

#[test]
fn full_flow_deposit_order_match_withdraw() {
    let ctx = setup(true);
    let env = &ctx.env;
    let c = &ctx.client;

    let idx = c.deposit(&ctx.user, &ctx.asset, &1_000i128, &f(env, 0xC0));
    assert_eq!(idx, 0);
    assert_eq!(TokenClient::new(env, &ctx.asset).balance(&ctx.pool), 1_000);

    let root0 = c.get_last_root();
    assert!(c.is_known_root(&root0));

    // place order O0 with a change note
    let (nf0, order0, change0, locked) = (f(env, 0x10), f(env, 0xA0), f(env, 0xCA), f(env, 1));
    c.place_order(
        &proof(env),
        &pub_inputs(env, &[root0.clone(), nf0.clone(), order0.clone(), change0, locked.clone()]),
    );
    assert!(c.is_active_order(&order0));
    assert!(c.is_spent(&nf0));

    // place order O1 with no change
    let root1 = c.get_last_root();
    let (nf1, order1) = (f(env, 0x11), f(env, 0xB0));
    c.place_order(
        &proof(env),
        &pub_inputs(env, &[root1, nf1, order1.clone(), zero(env), locked]),
    );
    assert!(c.is_active_order(&order1));

    // match O0 x O1
    let (fill_b, fill_s) = (f(env, 0xF1), f(env, 0xF2));
    c.match_orders(
        &proof(env),
        &pub_inputs(
            env,
            &[
                order0.clone(),
                order1.clone(),
                fill_b,
                fill_s,
                zero(env),
                zero(env),
                zero(env),
                zero(env),
            ],
        ),
    );
    assert!(!c.is_active_order(&order0));
    assert!(!c.is_active_order(&order1));

    // withdraw 600 to a fresh recipient
    let recipient = Address::generate(env);
    let root = c.get_last_root();
    let nf_w = f(env, 0x20);
    c.withdraw(
        &proof(env),
        &pub_inputs(env, &[root, nf_w.clone(), f(env, 0x99), f(env, 600), f(env, 1)]),
        &recipient,
        &600i128,
        &ctx.asset,
    );
    assert_eq!(TokenClient::new(env, &ctx.asset).balance(&recipient), 600);
    assert_eq!(TokenClient::new(env, &ctx.asset).balance(&ctx.pool), 400);
    assert!(c.is_spent(&nf_w));
}

#[test]
fn withdraw_double_spend_rejected() {
    let ctx = setup(true);
    let env = &ctx.env;
    let c = &ctx.client;
    c.deposit(&ctx.user, &ctx.asset, &1_000i128, &f(env, 0xC0));
    let root = c.get_last_root();
    let recipient = Address::generate(env);
    let nf = f(env, 0x42);
    let pi = pub_inputs(env, &[root, nf, f(env, 0x99), f(env, 100), f(env, 1)]);

    c.withdraw(&proof(env), &pi, &recipient, &100i128, &ctx.asset);
    assert_eq!(
        c.try_withdraw(&proof(env), &pi, &recipient, &100i128, &ctx.asset),
        Err(Ok(WraithError::NullifierUsed))
    );
}

#[test]
fn withdraw_unknown_root_rejected() {
    let ctx = setup(true);
    let env = &ctx.env;
    let c = &ctx.client;
    c.deposit(&ctx.user, &ctx.asset, &1_000i128, &f(env, 0xC0));
    let recipient = Address::generate(env);
    let bad_root = f(env, 0xDEAD);
    let pi = pub_inputs(env, &[bad_root, f(env, 1), f(env, 0x99), f(env, 100), f(env, 1)]);
    assert_eq!(
        c.try_withdraw(&proof(env), &pi, &recipient, &100i128, &ctx.asset),
        Err(Ok(WraithError::UnknownRoot))
    );
}

#[test]
fn withdraw_amount_mismatch_rejected() {
    let ctx = setup(true);
    let env = &ctx.env;
    let c = &ctx.client;
    c.deposit(&ctx.user, &ctx.asset, &1_000i128, &f(env, 0xC0));
    let root = c.get_last_root();
    let recipient = Address::generate(env);
    // public amount says 100, but the SAC transfer arg says 900
    let pi = pub_inputs(env, &[root, f(env, 1), f(env, 0x99), f(env, 100), f(env, 1)]);
    assert_eq!(
        c.try_withdraw(&proof(env), &pi, &recipient, &900i128, &ctx.asset),
        Err(Ok(WraithError::AmountMismatch))
    );
}

#[test]
fn withdraw_verification_failure_rejected() {
    let ctx = setup(false); // failing mock verifier
    let env = &ctx.env;
    let c = &ctx.client;
    c.deposit(&ctx.user, &ctx.asset, &1_000i128, &f(env, 0xC0));
    let root = c.get_last_root();
    let recipient = Address::generate(env);
    let pi = pub_inputs(env, &[root, f(env, 1), f(env, 0x99), f(env, 100), f(env, 1)]);
    assert_eq!(
        c.try_withdraw(&proof(env), &pi, &recipient, &100i128, &ctx.asset),
        Err(Ok(WraithError::VerificationFailed))
    );
}

#[test]
fn transfer_consumes_two_nullifiers_and_inserts_two_notes() {
    let ctx = setup(true);
    let env = &ctx.env;
    let c = &ctx.client;
    c.deposit(&ctx.user, &ctx.asset, &1_000i128, &f(env, 0xC0));
    let root = c.get_last_root();
    let (nf0, nf1, out0, out1) = (f(env, 0x31), f(env, 0x32), f(env, 0xD0), f(env, 0xD1));
    let pi = pub_inputs(env, &[root, nf0.clone(), nf1.clone(), out0, out1, f(env, 0xE0)]);

    c.transfer(&proof(env), &pi);
    assert!(c.is_spent(&nf0));
    assert!(c.is_spent(&nf1));

    // replay rejected (nullifiers spent)
    assert_eq!(
        c.try_transfer(&proof(env), &pi),
        Err(Ok(WraithError::NullifierUsed))
    );
}

#[test]
fn transfer_rejects_duplicate_nullifiers() {
    let ctx = setup(true);
    let env = &ctx.env;
    let c = &ctx.client;
    c.deposit(&ctx.user, &ctx.asset, &1_000i128, &f(env, 0xC0));
    let root = c.get_last_root();
    let nf = f(env, 0x55);
    let pi = pub_inputs(env, &[root, nf.clone(), nf, f(env, 0xD0), f(env, 0xD1), f(env, 0xE0)]);
    assert_eq!(
        c.try_transfer(&proof(env), &pi),
        Err(Ok(WraithError::DuplicateNullifier))
    );
}

#[test]
fn order_lifecycle_place_then_cancel() {
    let ctx = setup(true);
    let env = &ctx.env;
    let c = &ctx.client;
    c.deposit(&ctx.user, &ctx.asset, &1_000i128, &f(env, 0xC0));
    let root = c.get_last_root();
    let order = f(env, 0xA1);

    c.place_order(
        &proof(env),
        &pub_inputs(env, &[root, f(env, 0x70), order.clone(), zero(env), f(env, 1)]),
    );
    assert!(c.is_active_order(&order));

    c.cancel_order(
        &proof(env),
        &pub_inputs(env, &[order.clone(), f(env, 0x4F), f(env, 1)]),
    );
    assert!(!c.is_active_order(&order));
}

#[test]
fn match_rejects_inactive_order() {
    let ctx = setup(true);
    let env = &ctx.env;
    let c = &ctx.client;
    c.deposit(&ctx.user, &ctx.asset, &1_000i128, &f(env, 0xC0));
    let pi = pub_inputs(
        env,
        &[
            f(env, 0xA0),
            f(env, 0xB0),
            f(env, 0xF1),
            f(env, 0xF2),
            zero(env),
            zero(env),
            zero(env),
            zero(env),
        ],
    );
    assert_eq!(
        c.try_match_orders(&proof(env), &pi),
        Err(Ok(WraithError::OrderNotActive))
    );
}

#[test]
fn place_order_unknown_root_rejected() {
    let ctx = setup(true);
    let env = &ctx.env;
    let c = &ctx.client;
    c.deposit(&ctx.user, &ctx.asset, &1_000i128, &f(env, 0xC0));
    let pi = pub_inputs(
        env,
        &[f(env, 0xBAD), f(env, 1), f(env, 0xA0), zero(env), f(env, 1)],
    );
    assert_eq!(
        c.try_place_order(&proof(env), &pi),
        Err(Ok(WraithError::UnknownRoot))
    );
}

#[test]
fn rejects_malformed_public_inputs_length() {
    let ctx = setup(true);
    let env = &ctx.env;
    let c = &ctx.client;
    let recipient = Address::generate(env);
    let short = Bytes::from_slice(env, &[0u8; 31]);
    assert_eq!(
        c.try_withdraw(&proof(env), &short, &recipient, &1i128, &ctx.asset),
        Err(Ok(WraithError::InvalidPublicInputs))
    );
}
