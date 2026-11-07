# Frozen vaults

These files are what the app wrote at 2.9.1: the vault as it sits in the browser
(plain and encrypted), the older 150 000-round encrypted vault, both export files
and a CSV export. `app.test.mjs` opens every one of them through the app's own
paths (boot, unlock, Import, Import CSV) and checks that every account comes back
whole: names, ranks, logins, passwords, notes, tags, history and note fields.

**Never regenerate or edit these files.** They stand for vaults that already exist
on people's devices. If a change makes one of them fail to load, the change is
what has to give: add a migration, not a new fixture. When the storage or export
format changes, add a new frozen file for the new shape next to these and keep
the old ones.

The password of the encrypted ones is `fixture-pass`.
