//! Merkle Tree Contract for Privacy Note Commitments
//!
//! This contract stores and manages a Merkle tree of note commitments.
//! It provides the Merkle root for ZK proof verification and
//! allows membership proofs without revealing the actual note.
//!
//! Tree Structure:
//! - Height: 20 (supports up to ~1 million leaves)
//! - Hash function: keccak256 (for compatibility with circuits)
//! - Zero values computed lazily for efficiency

#![no_std]

mod hash;

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, BytesN, Env, Vec};

/// Tree height - supports 2^20 ≈ 1 million leaves
const TREE_HEIGHT: u32 = 20;

/// Storage keys
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Current number of inserted leaves
    LeafCount,
    /// Current Merkle root
    MerkleRoot,
    /// Admin address
    Admin,
    /// Authorized inserter contract (e.g., CLMM)
    AuthorizedInserter,
    /// Leaf at index
    Leaf(u32),
    /// Cached zero hash at level
    ZeroHash(u32),
}

/// Errors
#[contracterror]
#[repr(u32)]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum MerkleTreeError {
    TreeFull = 1,
    InvalidLeafIndex = 2,
    NotAuthorized = 3,
    RootNotSet = 4,
}

#[contract]
pub struct MerkleTreeContract;

/// Computes SHA256 hash of two child nodes
fn compute_hash(left: &BytesN<32>, right: &BytesN<32>) -> BytesN<32> {
    hash::hash_pair(left, right)
}

#[contractimpl]
impl MerkleTreeContract {
    /// Initialize the Merkle tree with admin
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::LeafCount, &0u32);
        // Initialize zero hash at level 0
        let zero = hash::zero_hash(&env);
        env.storage().instance().set(&DataKey::ZeroHash(0), &zero);
    }

    /// Insert a new leaf into the Merkle tree
    /// Returns the index of the inserted leaf and the new root
    pub fn insert(env: Env, admin: Address, leaf: BytesN<32>) -> Result<(u32, BytesN<32>), MerkleTreeError> {
        admin.require_auth();
        
        let leaf_count: u32 = env.storage().instance().get(&DataKey::LeafCount).unwrap_or(0);
        
        // Check if tree is full
        if leaf_count >= 2u32.pow(TREE_HEIGHT) {
            return Err(MerkleTreeError::TreeFull);
        }
        
        let leaf_index = leaf_count;
        
        // Store the leaf
        env.storage().instance().set(&DataKey::Leaf(leaf_index), &leaf);
        
        // Update leaf count
        env.storage().instance().set(&DataKey::LeafCount, &(leaf_index + 1));
        
        // Update Merkle root
        let new_root = Self::compute_root_from_leaves(&env, 0, leaf_index + 1);
        env.storage().instance().set(&DataKey::MerkleRoot, &new_root);
        
        Ok((leaf_index, new_root))
    }

    /// Set authorized inserter (admin only)
    /// This allows contracts like CLMM to insert without user auth
    pub fn set_authorized_inserter(env: Env, admin: Address, inserter: Address) -> Result<(), MerkleTreeError> {
        admin.require_auth();
        env.storage().instance().set(&DataKey::AuthorizedInserter, &inserter);
        Ok(())
    }

    /// Insert a note commitment (authorized by contract, not user)
    /// This is called by contracts like CLMM after ZK proof verification
    pub fn authorized_insert(env: Env, inserter: Address, leaf: BytesN<32>) -> Result<(u32, BytesN<32>), MerkleTreeError> {
        inserter.require_auth();
        let authorized: Option<Address> = env.storage().instance().get(&DataKey::AuthorizedInserter);

        if authorized.is_none() || authorized.unwrap() != inserter {
            return Err(MerkleTreeError::NotAuthorized);
        }

        let leaf_count: u32 = env.storage().instance().get(&DataKey::LeafCount).unwrap_or(0);

        // Check if tree is full
        if leaf_count >= 2u32.pow(TREE_HEIGHT) {
            return Err(MerkleTreeError::TreeFull);
        }

        let leaf_index = leaf_count;

        // Store the leaf
        env.storage().instance().set(&DataKey::Leaf(leaf_index), &leaf);

        // Update leaf count
        env.storage().instance().set(&DataKey::LeafCount, &(leaf_index + 1));

        // Update Merkle root
        let new_root = Self::compute_root_from_leaves(&env, 0, leaf_index + 1);
        env.storage().instance().set(&DataKey::MerkleRoot, &new_root);

        Ok((leaf_index, new_root))
    }

    /// Batch insert multiple leaves
    pub fn batch_insert(env: Env, admin: Address, leaves: Vec<BytesN<32>>) -> Result<(u32, BytesN<32>), MerkleTreeError> {
        admin.require_auth();
        
        let mut current_count: u32 = env.storage().instance().get(&DataKey::LeafCount).unwrap_or(0);
        let max_inserts = 2u32.pow(TREE_HEIGHT) - current_count;
        
        if leaves.len() as u32 > max_inserts {
            return Err(MerkleTreeError::TreeFull);
        }
        
        let first_index = current_count;
        
        for i in 0..leaves.len() {
            let leaf = leaves.get(i).unwrap();
            env.storage().instance().set(&DataKey::Leaf(current_count), &leaf);
            current_count += 1;
        }
        
        env.storage().instance().set(&DataKey::LeafCount, &current_count);
        
        // Compute root with all inserted leaves
        let new_root = Self::compute_root_from_leaves(&env, 0, current_count);
        env.storage().instance().set(&DataKey::MerkleRoot, &new_root);
        
        Ok((first_index, new_root))
    }

    /// Get the current Merkle root
    pub fn get_root(env: Env) -> Result<BytesN<32>, MerkleTreeError> {
        env.storage().instance()
            .get(&DataKey::MerkleRoot)
            .ok_or(MerkleTreeError::RootNotSet)
    }

    /// Get the number of inserted leaves
    pub fn get_leaf_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::LeafCount).unwrap_or(0)
    }

    /// Get a leaf at a specific index
    pub fn get_leaf(env: Env, index: u32) -> Result<BytesN<32>, MerkleTreeError> {
        env.storage().instance()
            .get(&DataKey::Leaf(index))
            .ok_or(MerkleTreeError::InvalidLeafIndex)
    }

    /// Verify a Merkle proof (computed off-chain)
    /// Returns true if the proof is valid
    pub fn verify_proof(
        _env: Env,
        leaf: BytesN<32>,
        root: BytesN<32>,
        proof_path: Vec<(BytesN<32>, bool)>,  // (sibling, is_left)
    ) -> bool {
        // Start with the leaf
        let mut current = leaf;
        
        // Walk up the tree
        let mut i = 0u32;
        while i < proof_path.len() {
            let (sibling, is_left) = proof_path.get(i).unwrap();
            
            current = if is_left {
                compute_hash(&current, &sibling)
            } else {
                compute_hash(&sibling, &current)
            };
            i += 1;
        }
        
        current == root
    }

    /// Compute Merkle root from a leaf and its index
    fn compute_root_from_index(env: &Env, mut leaf: BytesN<32>, index: u32) -> BytesN<32> {
        let mut current_index = index;
        
        for level in 0..TREE_HEIGHT {
            // Get zero hash for this level
            let zero_hash = Self::get_zero_hash(env, level);
            
            // Get sibling
            let sibling_index = if current_index % 2 == 0 { 
                current_index + 1 
            } else { 
                current_index - 1 
            };
            
            let leaf_count = Self::get_leaf_count(env.clone());
            let sibling = if sibling_index < leaf_count {
                env.storage().instance().get(&DataKey::Leaf(sibling_index)).unwrap()
            } else {
                zero_hash
            };
            
            // Compute parent hash
            leaf = if current_index % 2 == 0 {
                compute_hash(&leaf, &sibling)
            } else {
                compute_hash(&sibling, &leaf)
            };
            
            current_index = current_index / 2;
        }
        
        leaf
    }

    /// Compute root from a range of leaves
    fn compute_root_from_leaves(env: &Env, start: u32, end: u32) -> BytesN<32> {
        if start >= end {
            return Self::get_zero_hash(env, TREE_HEIGHT);
        }
        
        let mut current_level: Vec<BytesN<32>> = Vec::new(env);
        
        // Initialize with leaves
        let mut i = start;
        while i < end {
            let leaf: BytesN<32> = env.storage().instance().get(&DataKey::Leaf(i)).unwrap();
            current_level.push_back(leaf);
            i += 1;
        }
        
        // Hash pairs through every tree level, padding with that level's zero
        // subtree root. A single leaf still needs to be lifted to depth 20.
        let mut level = 0u32;
        while level < TREE_HEIGHT {
            let mut next_level: Vec<BytesN<32>> = Vec::new(env);
            
            let zero_hash = Self::get_zero_hash(env, level);
            
            let mut j = 0u32;
            while j < current_level.len() {
                let left = current_level.get(j).unwrap();
                let right = if j + 1 < current_level.len() {
                    current_level.get(j + 1).unwrap()
                } else {
                    zero_hash.clone()
                };
                next_level.push_back(compute_hash(&left, &right));
                j += 2;
            }
            
            current_level = next_level;
            level += 1;
        }
        
        current_level.get(0).unwrap_or_else(|| Self::get_zero_hash(env, TREE_HEIGHT))
    }

    /// Get zero hash for a level, computing if needed
    fn get_zero_hash(env: &Env, level: u32) -> BytesN<32> {
        if let Some(cached) = env.storage().instance().get::<_, BytesN<32>>(&DataKey::ZeroHash(level)) {
            return cached;
        }
        
        let zero = hash::zero_hash(env);
        
        if level == 0 {
            env.storage().instance().set(&DataKey::ZeroHash(0), &zero);
            return zero;
        }
        
        // Compute recursively
        let lower_zero = Self::get_zero_hash(env, level - 1);
        let higher_zero = compute_hash(&lower_zero, &lower_zero);
        
        env.storage().instance().set(&DataKey::ZeroHash(level), &higher_zero);
        higher_zero
    }
}
