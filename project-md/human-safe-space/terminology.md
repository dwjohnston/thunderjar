

A Thunderjar **test case** is fundamentally made up of **permutations** of a five **parameters**: 

- **base image** - Probably the least important of all the parameters. This is the base docker image, and it might also include other tooling that exists outside of the project, such as database

- **code state** this represents the source code of the application at a given point. ie typically a a commit. But it doesn't have to be git based - it could be matter of just copying files on to make a code state. 

- **prompt set** this is the source code of that relates to controlling a harness - typically AGENT.md, CLAUDE.md, SKILl.md files, as well as .agents/ and .claude/ folders etc. 

- **harness model** - This is a combination of the coding harness and the model it is running. It also includes other variables of the harness and model, such as effort and max thinking tokens. 
    - ☝️ In earlier ideation of Thunderjar harness and model were considered two different parameters. But we abandoned that approach - because some models can only apply to some harnesess. If you had a test case where it was `harness: ["claude-code", "codex"]` and `model: ["haiku", "sol"]` the cross product doesn't actually work. So it was decided to couple the harness and the model. It does make things a bit more verbose, but simplifies the conceptual model. 

- **initial prompt** - the value initially given to the harness. 



A **task** is not a parameter. A task is a container for some initial prompt parameters and **measurements** 

Each **test case** has a single **task**. A test case may vary the initial prompt parameters, but they are ultimately intended to solve the same goal. 

A **measurement** is not parameter. 

Every parameter has an **apply function**. An apply function is function that returns a string (an **apply function string**) , and these strings builds up the layers of the **prerun [docker] image**.  

A **test case** create a cross product of all of its parameters to create several **permutations**. 

A has of the value returned by the apply function is computed, this is the **parameter hash**. 

A a combination of all of these hashes makes up a **permutation hash**. There is a one-to-one mapping of permutation hashes to pre run docker images. 

**The golden rule** - The golden rule is that any apply function return string _MUST_  create deterministic behaviour. Because a simple hash of the string that determines  the parameter hash, and thus determines comparisons, it is important that any apply function string will create the same same docker image. 

Dynamic behaviour in parameters is possible, the **resolve function** is for this purpose. A resolve function is run before the apply function generates its string, and is a way of feeding data into the apply function. 

A test execution is an a single execution of a test case. 

An execution has an **execution id** which is a ULID(?) 

The execution life cycle

- A cross product of all the test cases parameters is created to determine all of its permutations. 
- A prerun docker image is built for each permutation, if it doesn't exist already. 
    - The parameter layers are applied, in this order: 
        - base image
        - code state
        - prompt set
        - harness nmodel
        - initial prompt 
    - For each parameter
        - The resolve function is called
        - The apply function is called, and this determines the docker image layer 

This creates the prerun docker image. 

Then: 
 - For each iteration a **run** occurs 

A **run** is a single instance of actually running an agent, in the prerun image. 

A run has a **run id** which has this format: `<execution id>-<permutation hash>-i<iteration number>`

When the run finishes, the container is serialised and this creates a **post run image**. There is a one to one mapping of run ids to post run images. 

## Measurements 

Measuring occurs after the postrun image is created. 

The measurements occur **inside** the post run image, they're esessentially scripts in their own right. 

A **measuring instrument** is a helpful, precanned  tool shipped with Thunderjar. A measuring instrument returns data of any shape. This data can be turning into **metrics** - a metric is always a number or a boolean. 


!! IMPORTANT: execution vs run is not working for me. 
A 'run' needs to be the full thing, and I need a new term for the individual executions. 

## Run statuses

**Failed execution** - if an individual execution exits non-zero for any reason
    - Common non-zero reaons are:
         - Rate limited
         - Trust/permissions issues ('workspace not trusted)
         - Network issues
         - Bad API key
    

- **Failed run** -  if _all_ of the individual executions of the run are failed. 
- **Partially failed run** - at least one, but not all individual executions are failed. 




## Also 

- captures
- runtimes
- purge 
