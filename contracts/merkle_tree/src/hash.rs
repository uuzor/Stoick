//! Hash functions for Merkle tree.
//!
//! This must match the Noir `wraith_lib::hash2` and SDK `hash2` exactly:
//! Poseidon2 over BN254 field elements, with each 32-byte node interpreted as
//! a big-endian field element reduced modulo the BN254 scalar field.

use soroban_poseidon::{poseidon2_hash, Field};
use soroban_sdk::{crypto::BnScalar, Bytes, BytesN, Env, U256, Vec};

/// Compute hash of two 32-byte field values using Poseidon2(left, right).
pub fn hash_pair(left: &BytesN<32>, right: &BytesN<32>) -> BytesN<32> {
    let env = left.env();
    let modulus = <BnScalar as Field>::modulus(env);
    let mut inputs = Vec::new(env);
    inputs.push_back(field_from_bytes(env, left, &modulus));
    inputs.push_back(field_from_bytes(env, right, &modulus));

    let out = poseidon2_hash::<4, BnScalar>(env, &inputs);
    let mut out_arr = [0u8; 32];
    out.to_be_bytes().copy_into_slice(&mut out_arr);
    BytesN::<32>::from_array(env, &out_arr)
}

/// Level-0 empty leaf is the zero field. Higher levels are hash_pair(zero, zero).
pub fn zero_hash(env: &Env) -> BytesN<32> {
    BytesN::<32>::from_array(env, &[0u8; 32])
}

fn field_from_bytes(env: &Env, value: &BytesN<32>, modulus: &U256) -> U256 {
    let bytes = Bytes::from_array(env, &value.to_array());
    U256::from_be_bytes(env, &bytes).rem_euclid(modulus)
}
