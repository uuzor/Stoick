//! CLMM Math Module
//!
//! Fixed-point arithmetic and math operations for concentrated liquidity.

/// Maximum tick value
pub const MAX_TICK: i64 = 887272;
/// Minimum tick value
pub const MIN_TICK: i64 = -887272;
/// Tick spacing scale (10^-4 = 0.01%)
pub const TICK_SPACING_SCALE: u32 = 10000;
/// Pool fee denominator (basis points)
pub const FEE_DENOMINATOR: u32 = 10000;

/// Validate tick range
pub fn validate_tick_range(tick_lower: i64, tick_upper: i64, tick_spacing: u32) -> bool {
    if tick_lower >= tick_upper {
        return false;
    }
    if tick_lower < MIN_TICK || tick_upper > MAX_TICK {
        return false;
    }
    if tick_lower % (tick_spacing as i64) != 0 {
        return false;
    }
    if tick_upper % (tick_spacing as i64) != 0 {
        return false;
    }
    true
}
