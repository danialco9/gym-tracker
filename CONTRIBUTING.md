# Contributing

The repository follows **Git Flow**: work is integrated on `develop` and reaches production only
through a release.

## Branches

| Branch | Starts from | Merges into | Used for |
| --- | --- | --- | --- |
| `main` | | | What runs in production. Every push to it deploys the app and API to Vercel and migrates the database. |
| `develop` | `main` | `main` (through a release) | Integration branch and the default branch of the repository. |
| `feature/*` | `develop` | `develop` | New features. |
| `bugfix/*` | `develop` | `develop` | Bugs found before they reach production. |
| `release/x.y.z` | `develop` | `main`, then `develop` | Preparing a new version. |
| `hotfix/*` | `main` | `main`, then `develop` | Urgent fixes to production. |
| `chore/*` | `develop` | `develop` | Maintenance: dependencies, CI, configuration. |
| `docs/*` | `develop` | `develop` | Documentation only. |

Nothing is pushed straight to `main` or `develop`: every change goes through a pull request, and the
backend, frontend and end-to-end checks must pass before it is merged.

## Day to day

```bash
git switch develop && git pull
git switch -c feature/rest-timer
# ...commit...
git push -u origin feature/rest-timer
gh pr create --base develop
```

## Releasing

Versions follow [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.

```bash
git switch develop && git pull
git switch -c release/1.1.0
git push -u origin release/1.1.0
gh pr create --base main --title "Release 1.1.0"
```

Once the pull request is merged and production is checked, tag the release and bring `main` back
into `develop`:

```bash
git switch main && git pull
git tag -a v1.1.0 -m "Release 1.1.0" && git push origin v1.1.0
gh pr create --base develop --head main --title "Merge release 1.1.0 back into develop"
```

## Hotfixes

```bash
git switch main && git pull
git switch -c hotfix/login-loop
# ...commit...
gh pr create --base main
```

After it is merged, tag a patch version (`v1.1.1`) and open a pull request from `main` to `develop`
so the fix is not lost in the next release.

## Dependency updates

[Dependabot](.github/dependabot.yml) opens pull requests to `develop` every Monday: one per folder
with the minor and patch updates grouped, and one for each major version, which may need code
changes. They go through the same checks as any other pull request.

GitHub Actions in the workflows are pinned to a full commit, with the version in a comment
(`actions/checkout@<sha> # v7.0.1`), so a moved tag cannot change what runs. Dependabot updates the
commit and the comment together; pin a new action the same way.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), written in English and in the present
tense, describing the change as the user or developer sees it:

```text
feat: keep a note on each exercise card of the workout
fix: the streak card counts this week's workouts from Monday
chore(ci): run checks on pull requests to develop
docs: screenshots of the week plan, milestones and share card
```

## Before opening a pull request

Run the checks described in [Getting started](README.md#checks).
