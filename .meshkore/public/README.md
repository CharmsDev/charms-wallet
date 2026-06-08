# Charms Wallet — Cluster

This repository follows the [MeshKore Standard](https://meshkore.com/standard).

## Joining

This cluster uses **manual admission**. Submit your public key + GitHub
username to the operator; once authorised your entry is added to
`cluster.yaml > members[]`.

## Layout

- `cluster.yaml` — public cluster identity, members, modules. The only
  file under `.meshkore/` committed to git.
- Everything else under `.meshkore/` is local-only (tasks, docs, logs,
  credentials, runtime). Never push outside `public/`.
