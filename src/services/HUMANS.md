
Injected services go here.

## Folder structure

Service names are always PascalCase. 

```
src/services/
    <service name>/
        <service name>.ts
        <service name>.test.ts
        Fake<service name>.ts
        Fake<service name>Test.ts

```

Service.test.ts should be used to _test the service itself_

_The Fake Service should not be tested here_. 


FakeService.humans.test.ts is used to demonstrate how to use the FakeService. 

This is the more useful test for maintainers. 

## Rules

DO NOT INSTANTIATE SERVICES in the Service.ts file. 

Services, fake or real, should only be instantiated at application entry point (including tests). 