#![no_std]

mod merkle;
mod types;

#[cfg(test)]
mod test;

use soroban_sdk::{
    contract, contractimpl, panic_with_error, token, Address, Bytes, BytesN, Env, IntoVal,
    InvokeError, MuxedAddress, Symbol, Val, Vec,
};

use crate::types::{
    DataKey, DepositEvent, OrderCancelledEvent, OrderMatchedEvent, OrderPlacedEvent, TransferEvent,
    WithdrawEvent, WraithError,
};

/// UltraHonk proof length (SHARED.md §6): exactly 456 * 32 bytes.
const PROOF_BYTES: usize = 456 * 32;

#[contract]
pub struct WraithPool;

#[contractimpl]
impl WraithPool {
    pub fn __constructor(
        env: Env,
        transfer_vf: Address,
        order_vf: Address,
        match_vf: Address,
        withdraw_vf: Address,
        cancel_vf: Address,
    ) {
        let s = env.storage().instance();
        s.set(&DataKey::TransferVf, &transfer_vf);
        s.set(&DataKey::OrderVf, &order_vf);
        s.set(&DataKey::MatchVf, &match_vf);
        s.set(&DataKey::WithdrawVf, &withdraw_vf);
        s.set(&DataKey::CancelVf, &cancel_vf);
    }

    /// Bridge: deposit a classic Stellar asset into Wraith. The amount is public;
    /// the depositor supplies the note `commitment` (computed off-chain from secret
    /// data) which is inserted as a Merkle leaf. No ZK proof required (SPEC §5.1).
    pub fn deposit(
        env: Env,
        from: Address,
        asset: Address,
        amount: i128,
        commitment: BytesN<32>,
    ) -> u32 {
        from.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, WraithError::InvalidAmount);
        }
        let token = token::Client::new(&env, &asset);
        let contract: MuxedAddress = env.current_contract_address().into();
        token.transfer(&from, &contract, &amount);

        let index = merkle::insert(&env, &commitment);
        DepositEvent {
            index,
            commitment,
            asset,
            amount,
        }
        .publish(&env);
        index
    }

    /// Bridge: withdraw from Wraith to a classic Stellar account.
    ///
    /// SHARED.md §7 — `withdraw` public inputs, in declared order:
    ///   [0] merkle_root  [1] nullifier  [2] recipient_hash  [3] amount  [4] asset_id
    pub fn withdraw(
        env: Env,
        proof: Bytes,
        public_inputs: Bytes,
        recipient: Address,
        amount: i128,
        asset: Address,
    ) -> Result<(), WraithError> {
        let f = parse_fields(&env, &public_inputs, 5)?;
        let root = f.get(0).unwrap();
        let nullifier = f.get(1).unwrap();
        let pub_amount = f.get(3).unwrap();

        if !merkle::is_known_root(&env, &root) {
            return Err(WraithError::UnknownRoot);
        }
        if is_spent(&env, &nullifier) {
            return Err(WraithError::NullifierUsed);
        }
        if amount <= 0 {
            return Err(WraithError::InvalidAmount);
        }
        // Bind the SAC transfer amount to the amount proven public in the circuit,
        // so a valid proof cannot be replayed against a different transfer amount.
        if pub_amount.to_array() != amount_to_field(amount) {
            return Err(WraithError::AmountMismatch);
        }
        verify(&env, DataKey::WithdrawVf, &public_inputs, &proof)?;

        mark_spent(&env, &nullifier);
        let token = token::Client::new(&env, &asset);
        let to: MuxedAddress = recipient.clone().into();
        token.transfer(&env.current_contract_address(), &to, &amount);
        WithdrawEvent {
            nullifier,
            recipient,
            asset,
            amount,
        }
        .publish(&env);
        Ok(())
    }

    /// Pay: private transfer. Consumes two input notes (nullifiers) and inserts two
    /// output note commitments.
    ///
    /// SHARED.md §7 — `transfer` public inputs, in declared order:
    ///   [0] merkle_root [1] nullifier_0 [2] nullifier_1
    ///   [3] out_commitment_0 [4] out_commitment_1 [5] ext_data_hash
    pub fn transfer(env: Env, proof: Bytes, public_inputs: Bytes) -> Result<(), WraithError> {
        let f = parse_fields(&env, &public_inputs, 6)?;
        let root = f.get(0).unwrap();
        let nullifier_0 = f.get(1).unwrap();
        let nullifier_1 = f.get(2).unwrap();
        let out_commitment_0 = f.get(3).unwrap();
        let out_commitment_1 = f.get(4).unwrap();

        if !merkle::is_known_root(&env, &root) {
            return Err(WraithError::UnknownRoot);
        }
        if nullifier_0 == nullifier_1 {
            return Err(WraithError::DuplicateNullifier);
        }
        if is_spent(&env, &nullifier_0) || is_spent(&env, &nullifier_1) {
            return Err(WraithError::NullifierUsed);
        }
        verify(&env, DataKey::TransferVf, &public_inputs, &proof)?;

        mark_spent(&env, &nullifier_0);
        mark_spent(&env, &nullifier_1);
        merkle::insert(&env, &out_commitment_0);
        merkle::insert(&env, &out_commitment_1);

        let mut nullifiers = Vec::new(&env);
        nullifiers.push_back(nullifier_0);
        nullifiers.push_back(nullifier_1);
        let mut commitments = Vec::new(&env);
        commitments.push_back(out_commitment_0);
        commitments.push_back(out_commitment_1);
        TransferEvent {
            nullifiers,
            commitments,
        }
        .publish(&env);
        Ok(())
    }

    /// Swap: place a hidden order. Locks a balance note (nullifier), registers the
    /// opaque order commitment in the active set, and inserts the change note if any.
    ///
    /// SHARED.md §7 — `place_order` public inputs, in declared order:
    ///   [0] merkle_root [1] nullifier [2] order_commitment
    ///   [3] change_commitment [4] locked_asset_id
    pub fn place_order(env: Env, proof: Bytes, public_inputs: Bytes) -> Result<(), WraithError> {
        let f = parse_fields(&env, &public_inputs, 5)?;
        let root = f.get(0).unwrap();
        let nullifier = f.get(1).unwrap();
        let order_commitment = f.get(2).unwrap();
        let change_commitment = f.get(3).unwrap();

        if !merkle::is_known_root(&env, &root) {
            return Err(WraithError::UnknownRoot);
        }
        if is_spent(&env, &nullifier) {
            return Err(WraithError::NullifierUsed);
        }
        if order_active(&env, &order_commitment) {
            return Err(WraithError::DuplicateOrder);
        }
        verify(&env, DataKey::OrderVf, &public_inputs, &proof)?;

        mark_spent(&env, &nullifier);
        add_order(&env, &order_commitment);
        if !is_zero(&change_commitment) {
            merkle::insert(&env, &change_commitment);
        }
        OrderPlacedEvent {
            order_commitment,
            change_commitment,
        }
        .publish(&env);
        Ok(())
    }

    /// Swap: match two compatible orders. Removes both orders, inserts the two
    /// settlement notes, re-registers any residual orders, and inserts any refund
    /// notes. The circuit proves compatibility / fair pricing; the contract only
    /// manages the active-order set and the note tree.
    ///
    /// SHARED.md §7 — `match_orders` public inputs, in declared order:
    ///   [0] order_commitment_a [1] order_commitment_b
    ///   [2] fill_note_buyer [3] fill_note_seller
    ///   [4] residual_order_a [5] residual_order_b
    ///   [6] refund_note_a [7] refund_note_b
    pub fn match_orders(env: Env, proof: Bytes, public_inputs: Bytes) -> Result<(), WraithError> {
        let f = parse_fields(&env, &public_inputs, 8)?;
        let order_a = f.get(0).unwrap();
        let order_b = f.get(1).unwrap();
        let fill_buyer = f.get(2).unwrap();
        let fill_seller = f.get(3).unwrap();
        let residual_a = f.get(4).unwrap();
        let residual_b = f.get(5).unwrap();
        let refund_a = f.get(6).unwrap();
        let refund_b = f.get(7).unwrap();

        if order_a == order_b {
            return Err(WraithError::DuplicateOrder);
        }
        if !order_active(&env, &order_a) || !order_active(&env, &order_b) {
            return Err(WraithError::OrderNotActive);
        }
        verify(&env, DataKey::MatchVf, &public_inputs, &proof)?;

        remove_order(&env, &order_a);
        remove_order(&env, &order_b);
        merkle::insert(&env, &fill_buyer);
        merkle::insert(&env, &fill_seller);
        if !is_zero(&residual_a) {
            add_order(&env, &residual_a);
        }
        if !is_zero(&residual_b) {
            add_order(&env, &residual_b);
        }
        if !is_zero(&refund_a) {
            merkle::insert(&env, &refund_a);
        }
        if !is_zero(&refund_b) {
            merkle::insert(&env, &refund_b);
        }
        OrderMatchedEvent {
            order_a,
            order_b,
            fill_buyer,
            fill_seller,
        }
        .publish(&env);
        Ok(())
    }

    /// Swap: cancel an open order, returning the locked funds as a new balance note.
    ///
    /// SHARED.md §7 — `cancel_order` public inputs, in declared order:
    ///   [0] order_commitment [1] refund_commitment [2] refund_asset_id
    pub fn cancel_order(env: Env, proof: Bytes, public_inputs: Bytes) -> Result<(), WraithError> {
        let f = parse_fields(&env, &public_inputs, 3)?;
        let order_commitment = f.get(0).unwrap();
        let refund_commitment = f.get(1).unwrap();

        if !order_active(&env, &order_commitment) {
            return Err(WraithError::OrderNotActive);
        }
        verify(&env, DataKey::CancelVf, &public_inputs, &proof)?;

        remove_order(&env, &order_commitment);
        merkle::insert(&env, &refund_commitment);
        OrderCancelledEvent {
            order_commitment,
            refund: refund_commitment,
        }
        .publish(&env);
        Ok(())
    }

    pub fn get_last_root(env: Env) -> BytesN<32> {
        merkle::last_root(&env)
    }

    pub fn is_known_root(env: Env, root: BytesN<32>) -> bool {
        merkle::is_known_root(&env, &root)
    }

    pub fn is_spent(env: Env, nullifier: BytesN<32>) -> bool {
        is_spent(&env, &nullifier)
    }

    pub fn is_active_order(env: Env, commitment: BytesN<32>) -> bool {
        order_active(&env, &commitment)
    }
}

/// Cross-contract call to the per-circuit UltraHonk verifier. Public inputs FIRST,
/// then proof, exactly per SHARED.md §6 (mirrors the reference mixer).
fn verify(
    env: &Env,
    vf_key: DataKey,
    public_inputs: &Bytes,
    proof: &Bytes,
) -> Result<(), WraithError> {
    if proof.len() as usize != PROOF_BYTES {
        return Err(WraithError::VerificationFailed);
    }
    let verifier: Address = env
        .storage()
        .instance()
        .get(&vf_key)
        .ok_or(WraithError::VerifierNotSet)?;
    let mut args: Vec<Val> = Vec::new(env);
    args.push_back(public_inputs.into_val(env));
    args.push_back(proof.into_val(env));
    env.try_invoke_contract::<(), InvokeError>(&verifier, &Symbol::new(env, "verify_proof"), args)
        .map_err(|_| WraithError::VerificationFailed)?
        .map_err(|_| WraithError::VerificationFailed)
}

/// Parse `public_inputs` as `n` consecutive 32-byte big-endian field elements.
fn parse_fields(
    env: &Env,
    public_inputs: &Bytes,
    n: u32,
) -> Result<Vec<BytesN<32>>, WraithError> {
    if public_inputs.len() != n * 32 {
        return Err(WraithError::InvalidPublicInputs);
    }
    let mut out = Vec::new(env);
    let mut i = 0u32;
    while i < n {
        let mut field = [0u8; 32];
        public_inputs
            .slice(i * 32..i * 32 + 32)
            .copy_into_slice(&mut field);
        out.push_back(BytesN::from_array(env, &field));
        i += 1;
    }
    Ok(out)
}

/// 32-byte big-endian canonical field encoding of a non-negative `amount` (< 2^127).
fn amount_to_field(amount: i128) -> [u8; 32] {
    let mut out = [0u8; 32];
    out[16..32].copy_from_slice(&amount.to_be_bytes());
    out
}

fn is_zero(b: &BytesN<32>) -> bool {
    b.to_array() == [0u8; 32]
}

fn is_spent(env: &Env, nullifier: &BytesN<32>) -> bool {
    env.storage()
        .persistent()
        .has(&DataKey::Nullifier(nullifier.clone()))
}

fn mark_spent(env: &Env, nullifier: &BytesN<32>) {
    env.storage()
        .persistent()
        .set(&DataKey::Nullifier(nullifier.clone()), &true);
}

fn order_active(env: &Env, commitment: &BytesN<32>) -> bool {
    env.storage()
        .persistent()
        .has(&DataKey::Order(commitment.clone()))
}

fn add_order(env: &Env, commitment: &BytesN<32>) {
    env.storage()
        .persistent()
        .set(&DataKey::Order(commitment.clone()), &true);
}

fn remove_order(env: &Env, commitment: &BytesN<32>) {
    env.storage()
        .persistent()
        .remove(&DataKey::Order(commitment.clone()));
}
