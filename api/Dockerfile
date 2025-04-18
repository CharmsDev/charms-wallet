FROM rust AS builder
WORKDIR /app
COPY . .
RUN cargo build --release --bin api

FROM bitcoin/bitcoin:latest AS bitcoin-source

# We do not need the Rust toolchain to run the binary!
FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y libssl3 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/api /usr/local/bin
COPY --from=bitcoin-source /opt/bitcoin-28.1/bin/bitcoin-cli /usr/local/bin/bitcoin-cli
COPY ./bitcoin.conf /root/.bitcoin/bitcoin.conf
ENTRYPOINT ["/usr/local/bin/api"]
