//! CLMM Contract Tests

#[cfg(test)]
mod tests {
    use crate::math::validate_tick_range;
    use crate::types::ClmmError;

    #[test]
    fn test_validate_tick_range_valid() {
        assert!(validate_tick_range(-1000, 1000, 100));
        assert!(validate_tick_range(0, 100, 100));
        assert!(validate_tick_range(-887272, 887272, 100));
    }

    #[test]
    fn test_validate_tick_range_invalid() {
        assert!(!validate_tick_range(1000, -1000, 100));
        assert!(!validate_tick_range(-900000, 1000, 100));
        assert!(!validate_tick_range(-1000, 900000, 100));
        assert!(!validate_tick_range(-995, 1000, 100));
    }

    #[test]
    fn test_error_conversion() {
        let err: soroban_sdk::Error = ClmmError::InvalidTickRange.into();
        assert_eq!(err.code(), 4);
    }
}
