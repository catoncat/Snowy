# @bbl-next/browser-vfs

In-browser virtual filesystem over `mem://` URIs with IndexedDB persistence, quota management, snapshots, and skill package discovery.

## API Entry

```ts
import { BrowserVfs, IndexedDbVfsStore, resolveMemUri } from "@bbl-next/browser-vfs";
```

## Key Exports

| Category | Examples |
|----------|---------|
| VFS class | `BrowserVfs` — read/write/edit/stat/list/mkdir/rm/mv/copy/stage/snapshot/rehydrate/rollback/discoverPackages |
| Store | `IndexedDbVfsStore` — `PersistentVfsStore` backed by IndexedDB |
| URI parser | `resolveMemUri()` — parse `mem://scope/workspace/path` |
| Types | `VfsScope` (`ephemeral`/`workspace`/`library`), `VfsEntry`, `VfsStat`, `VfsSnapshotMetadata` |
| Package discovery | `VfsPackageInfo`, `PACKAGE_MARKER` (`"SKILL.md"`) |

## Scopes

| Scope | Persistence | Use Case |
|-------|-------------|----------|
| `ephemeral` | Memory only | Scratch / temp data |
| `workspace` | IndexedDB | Per-session workspace files |
| `library` | IndexedDB | Installed skills and packages |

## Dependencies

- `@bbl-next/contracts`
- `idb` (IndexedDB wrapper)
