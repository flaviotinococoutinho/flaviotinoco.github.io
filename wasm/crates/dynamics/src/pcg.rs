//! PCG32 pseudo-random generator (O'Neill 2014): PCG-XSH-RR with 64-bit state and
//! 32-bit output, seeded exactly like the reference `pcg32_srandom_r(seed, stream)`.

/// LCG multiplier of the reference implementation.
pub const MULTIPLIER: u64 = 6_364_136_223_846_793_005;

/// Stream selector used by `clt_histogram` (the reference demo's `54`).
pub const CLT_STREAM: u64 = 54;

/// Stream selector used by the flow field.
pub const FLOW_STREAM: u64 = 0x00F1_0FF1;

/// PCG-XSH-RR 64/32.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Pcg32 {
    state: u64,
    inc: u64,
}

impl Pcg32 {
    /// `pcg32_srandom_r(seed, stream)`: increment `(stream << 1) | 1`, one step, add the
    /// seed, one more step.
    #[must_use]
    pub fn new(seed: u64, stream: u64) -> Self {
        let mut rng = Self {
            state: 0,
            inc: (stream << 1) | 1,
        };
        rng.next_u32();
        rng.state = rng.state.wrapping_add(seed);
        rng.next_u32();
        rng
    }

    /// Next 32-bit output: `rotr((state ^ (state >> 18)) >> 27, state >> 59)` of the old state.
    pub fn next_u32(&mut self) -> u32 {
        let old = self.state;
        self.state = old.wrapping_mul(MULTIPLIER).wrapping_add(self.inc);
        let xorshifted = (((old >> 18) ^ old) >> 27) as u32;
        let rot = (old >> 59) as u32;
        xorshifted.rotate_right(rot)
    }

    /// Uniform `f64` in `[0, 1)` with 32 bits of resolution: `next_u32() · 2^−32`.
    pub fn next_f64(&mut self) -> f64 {
        f64::from(self.next_u32()) * (1.0 / 4_294_967_296.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_reference_demo_output() {
        // pcg32-demo: pcg32_srandom_r(&rng, 42u, 54u), first six outputs.
        let mut rng = Pcg32::new(42, 54);
        let got: Vec<u32> = (0..6).map(|_| rng.next_u32()).collect();
        assert_eq!(
            got,
            [
                0xa15c_02b7,
                0x7b47_f409,
                0xba1d_3330,
                0x83d2_f293,
                0xbfa4_784b,
                0xcbed_606e
            ]
        );
    }

    #[test]
    fn unit_interval() {
        let mut rng = Pcg32::new(1, CLT_STREAM);
        for _ in 0..10_000 {
            let u = rng.next_f64();
            assert!((0.0..1.0).contains(&u));
        }
    }
}
