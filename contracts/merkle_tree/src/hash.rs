//! Hash functions for Merkle tree
//!
//! Uses SHA256 for hashing in the Merkle tree.
//! In production, this would use Poseidon for better ZK-friendly properties.

use soroban_sdk::{BytesN, Bytes, Env};

/// Compute hash of two 32-byte values using SHA256(a || b)
pub fn hash_pair(left: &BytesN<32>, right: &BytesN<32>) -> BytesN<32> {
    let env = left.env();
    let mut input = Bytes::new(env);
    input.append(&mut left.clone().into());
    input.append(&mut right.clone().into());
    
    // Use SHA256
    let hash_result = env.crypto().sha256(&input);
    let output: [u8; 32] = hash_result.try_into().unwrap();
    BytesN::<32>::from_array(env, &output)
}

/// Compute hash of a single value (used for leaves)
pub fn hash_leaf(value: &BytesN<32>) -> BytesN<32> {
    let env = value.env();
    let mut input = Bytes::new(env);
    input.append(&mut value.clone().into());
    
    let hash_result = env.crypto().sha256(&input);
    let output: [u8; 32] = hash_result.try_into().unwrap();
    BytesN::<32>::from_array(env, &output)
}

/// Compute zero hash (hash of 32 zero bytes)
pub fn zero_hash(env: &Env) -> BytesN<32> {
    let input = BytesN::<32>::from_array(env, &[0u8; 32]);
    hash_leaf(&input)
}
