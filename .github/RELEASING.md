# Releases

Changesets maintains the stable **Version Packages** PR. Merging it publishes to
npm's `latest` tag and deploys docs from stable Git tags. The docs root shows the
newest stable release; `/thunderjar/v/X.Y.Z/` shows any tagged stable version.
Docs changes on `main` appear publicly when the next stable release is published.

The release workflow also maintains a separate **Release candidate** PR whenever
pending changesets differ from the last published RC. Merging it publishes
`X.Y.Z-rc.N` to npm's `rc` tag and creates a GitHub prerelease. It leaves the
changesets in place for the stable PR. Another RC PR appears when those changesets
change. Review and merge a current RC PR before its stable PR; an RC PR is closed
when the stable release consumes the changesets.

To publish a preview of an open PR from a branch in this repository, a maintainer
with write access comments exactly `/preview`. The workflow replies with a package
version pinned to that PR's head commit. Install the exact version in the reply;
the shared `preview` dist-tag can move when another preview is published. Fork PRs
are not eligible. Repeating the command for the same commit does not republish it.

## Repository setup

- Allow GitHub Actions to create pull requests in repository Actions settings.
- Require CI checks and up-to-date branches before merging release PRs. GitHub
  may ask a maintainer to approve runs on bot-created PRs.
- Configure npm trusted publishing for `thunderjar` with GitHub repository
  `dwjohnston/thunderjar` and workflow filename `preview.yml`. Enable direct
  `npm publish`; leave the environment name blank. Keep the existing `release.yml`
  trusted publisher. Both workflows use OIDC and need no npm token.
- Set GitHub Pages source to **GitHub Actions**. Run **Deploy stable versioned docs**
  manually once to publish the existing `v0.1.0` docs.

See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/),
[Actions PR permissions](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository),
and [Pages workflow deployments](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
