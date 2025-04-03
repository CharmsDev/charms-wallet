FROM rust AS builder
WORKDIR /app
COPY . .
RUN cargo build --release --bin api

# We do not need the Rust toolchain to run the binary!
FROM debian:bookworm-slim AS runtime
COPY --from=builder /app/target/release/api /usr/local/bin
ENTRYPOINT ["/usr/local/bin/api"]
