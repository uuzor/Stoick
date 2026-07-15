//! ZK Verifier Contract for CLMM Operations
//!
//! This contract uses rs-soroban-ultrahonk from Nethermind for actual
//! UltraHonk proof verification on Stellar Soroban.

#![no_std]

// Re-export the UltraHonk verifier contract from Nethermind
// This provides real cryptographic verification using UltraHonk
pub use rs_soroban_ultrahonk::UltraHonkVerifierContract;
