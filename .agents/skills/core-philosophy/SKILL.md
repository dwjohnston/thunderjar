---
name: core-philosophy
description: For setting up new projects, or marking architectural decisions about an application
---



## Get your end to end deployment to production sorted first

- Get your CI servers, deployment strategy, artifact publishing, all of that sorted _first_. 

**Rationale** This stuff is harder than you think, better to get it out the way with first, and then refined as you develop the actual application functionality. 

## Artifact versioning: 

- Semvar
- Use changesets
- 'preview' releases - releases from code that is not yet merged to main, manually triggered with something like a slash-command in a github comment on a PR 
- 'release candidate' releases - a release from what is currently on main 


## CI Metrics

- Measure the time important steps of the pipelines is taking
  - Each individual test
  - Lint, type checking etc. 
- Have these published to a pipeline


**Rationale** You want to see the slow creep up of build times on a chart, get a clear picture of things. 


## No ambient non-determistic behaviour 


**Exception**: Loggers.

- No Date.now(), no Math.random(), no setTimeout(), no .toLocaleString() etc 
  - These _must_ be injected with formal dependency injection 
  - Use a linter to ban these functions, except where they are injected. 

- Prefer pure DI by default. Adopt a DI framework when pure DI becomes painful.

## Database roles/credentials

Applications should only need the access the need for _routine_ behaviour. Things like modifying columns etc, should be considered _exceptional_ behaviour that requires a different role. 

Applications that do routine reading/writing of data should assume that the tables and their columns already exist. 

For example, say we have an application that is recording CI metrics in a database, there will be two roles: 

- Metrics writer - INSERT 
- Metrics reader - SELECT 

When this application is initialised, or during a major change migration new tables, new columns might need to be added. 

In this case a a intialised/migration script should be run with a seperate admin role.  

As such 'create table if it doesn't exist' functionality should not be included in regular application behaviour. 

**Rationale** Limit the blast radius that an application can make if a mistake or malicious activity occurs. 


