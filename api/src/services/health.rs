pub struct HealthChecker;

impl HealthChecker {
    pub fn new() -> Self {
        Self
    }

    pub fn check(&self) -> bool {
        true
    }
}
