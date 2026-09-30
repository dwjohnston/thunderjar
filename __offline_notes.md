This page is a collection of notes written by the human user while they had patchy internet. 

This is largely reviewing the items in 021. 

Comments may appear here, or inline with the file, denoted with a 🙋‍♂️ emoji. 

When reviewing human notes, any syntax, code blocks etc should be considered indicative psuedo code only, not exact specificiation. 


Things we need: 

- An example file structure to reference


Re 060 measuring instruments and measurements. 


Measurements do not affect the pre or post run image, and as such they should not affect the permutation hash. 

Measuring instruments and measurements should be pulled out of 060. 

_However_ measurements _are_ conceptually tied to tasks. 

That is, if my task instruction is 

> "Create a file isPrime.ts" 

My measurements might be: 

```
expect isPrime.ts to exist
expect isPrime.test.ts to exist
expect isPrime to work against this template test. 
```


That is to say that I don't think it makes sense to declare an experiment like 

```js
declareExperiment({
    baseImage: ["my-base-image"]
    experimentName: "my experiment", 
    codeState: ["code-state-a"],
    promptSet: ["prompt-set-1"],
    harness: ["claude-code-v123"],
    model: ["sonnet-5.5"],
    task: ["task-1"], 
    measurements: ["isPrimeTsExists", "isPrimeTestExists", "isPrimeTemplateTest"]

})
```

There are two reasons for this: 

1. If I later declare a different experiment, I end up copy pasting this part

```
    task: ["task-1"], 
    measurements: ["isPrimeTsExists", "isPrimeTestExists", "isPrimeTemplateTest"]
```

It's a pain and is prone to copy paste errors. 

2. Those measurements aren't relevant to other tasks. 



So I think what we want to say is that measurements should be considered a part of the task, but in a manner that doesn't affect the permutation hash. 

Q: If we later modify the measurements, either: 
- We add new measurements
- We modify existing measurements 

How does this affect previous experiment results? 

I think  the answer is: 

- An experiment result is keyed by the experiment id, the date and the a measurements hash. 

If we later _just modify the measurements_ then we are creating new experiment results for all the previous runs - same experiment id, same date, new hash. 

In terms of visualising this, we probably don't care about the previous version of the measurements. 

Remember: if what we are comparing is the the exact same experiement, just run at different times, _we're not really expecting it to change_, if it is changing it demonstrates that either something is broken with Thunderjar, or or configuration, or something fucky is going on with the AI providers. 

That is: 
Running the same experiment overtime is not really the main comparision flow we are interested in. 

The comparison flow we are interested in really is what we have been calling 'floating experiments'. I think we want to define 'floating parameters'. These are most likely to be the code state and prompt sets, but could also be the harness and model versions. And they're typically going to mean 'the most recent commit'. 

One way we _could_ be comparing this, is we do an experiment like: 

```js
declareExperiment({
    baseImage: ["my-base-image"]
    experimentName: "my experiment", 
    
    codeState: ["code-state-a", "code-state-b", "code-state-c"],
    promptSet: ["prompt-set-1"],
    harness: ["claude-code-v123"],
    model: ["sonnet-5.5"],
    task: ["task-1"], 
    measurements: ["isPrimeTsExists", "isPrimeTestExists", "isPrimeTemplateTest"]

})
```

That is, this is our regular baseline thunderjar experiment. 

So there is an open question here, which is about how we visualise/communicate the difference between different ~~container runs~~ of different parameter permutations. *Container runs* is not not the correct primitive here - it's really the aggregated result of all the iterations for that parameter permutation, even if if the iteration count is just 1. 

Possibly the primitive here is that we have the concept of a 'aggregation result'. This term is a work in progress. An aggregation result is the averaged/aggregated presentation of the of the results accross all iterations for that specific permutation in that experiment execution. 

Basically _whatever_ the source of the aggregation result, whether: 

- Different permutations within the same experiment execution 
- Multiple executions of the same experiment 
- Repeated executions of the same experiment using floating parameters 

We should be able to compare the aggregation results. I think the only requiriement is that the aggregation result has the same shape - and this is doable - the measurements backfilling allows this. 

This simplifies things in the sense that we just need to record aggregation results, and then it's up to our presentation layer to determine what aggregation results are required to be compared, fetch them, and present the compparison. 



## Relating harnesses and models to each other 


One of the goals of this project is that the configuration experience is delightful - and is nicely typed. 
When we declare an experiment, the strings in the arrays should be strongly typed, not free text. The way I'm thinking we make this work is that there is a script that generates the types from the folder structures. 


Now, some harnesses only allow certain models (eg. Claude code only allows the claude family of models). 

But at the same time, something a user might want to do is compare the same model between two harnesses. Eg. how does Sonnet 5.5 behave on Claude Code vs OpenCode? 

Now, I believe that there can be some nuance about how 

I'm thinking the way we do this is:

```typescript 
// experiment-parameters/harnesses/claude-code-123/index.ts
export default declareHarness({
    version: "1.2.3",
  applyParameter: () =>
    `COPY --from=thunderjar/harness-claude-code:${version} /opt/claude /opt/claude`,

  // run: execute the agent, and write the result file
  cli: (ctx) =>
    `claude -p "${ctx.taskInstruction}" --model ${ctx.model} ` +
    `--allowedTools "Write,Edit,Read,Bash" --output-format json > ${ctx.resultPath}`,
   availableModels: [

       // 👇 These must match the folders in the `experiment-parameters/models/ directory 
       "haiku-1",
       "haiku-2",
       "sonnet-1"
   ]
})
```

```typescript 

//`experiment-parameters/models/haiku-1.1
export default declareModel({
  applyParameter: () => ``, // Typically a no-op right? 

  harnessSpecificMapping: {

    // 👇 The key needs to exist in /experiment-parameters/harnesses directory 
    "claude-code-123": "haiku-something",
    "claude-code-124": "haiku-something",
    "opencode-123": "anthropic/haiku-something"
  }
})
```

This could potentially be cumbersome - possibly we would map using a kind of 'harness family' kind of thing. Let's talk about it.
My current feeling is that I'm not worried about it being cumbersome, so would prefer optimise on the more simple conceptual model.
 
 ---
I have added 002 launch plan. This is a a kind of timeline building up a plan of things to do in the future. 
 ---

087 mentions duration - how are rthese collected? 


With 087 it feels like there's a question about whether duration and token costs are really a kind of measurement. 

But no they're not - I can't see that there's a conceivable way that they'd be configured _per task_. 

--- 

Possibly we want the concept of pre-canned reusable measurements, for convenience, but let's leave that out of scope for now. 

--- 
085
```
Storage: three tiers, not two
Extends 070-data-architecture.md's design to three tiers:

Run data store — date, the permutation's experiment parameters and parameter hash, measurements, cost, tokens, duration. Small and queryable — this is what "did this get worse since last week" queries run against. Covered below.
Trace store — the OTel trace and session transcript. Not populated in v1 — see Deferred: trace store below.
Image store — the prerun/postrun images themselves. See 081-docker-tagging.md.

```

THis is weird. We are meant to be creating a spec, not a set of contradictions. 

There are two tiers of storage, and just mention that future state is that we might add a third. 

Suggest a prompt that might avoid this mistake. 


Why are we adding hashes to the measurements? 

>The instrument name alone isn't enough — a task can declare two grep measurements with different configs, and they are different measurements. 

Oh. Why don't we just name the measurements? 



>What gets written to the run data store


Very good. 



---


Your tasks: 

- Pull the stuff about measurements out of 060, into 065 measurements. 
- Create a folder structure in 051-configuration-folder-structure 
- Updates to be clear about measurements not affecting parameter hashes, but be inherrently tied to tasks. The way I'm thinking about this is that it exists under the task declaration folder, but in a manner that doesn't get folded in to that hash. 




Miscellanous principals:

When exporting typescript for Thunderjar configuration files, never do a bare export, and don't use the `satisfies` `as` or (what's the term, type asssertsion, the `const foo: string = "hello"` thing)

Intead, use a function, like

```typescript 
export default declareHarness({
    // config here 
})
```

This is a nice convenience that enforces typing very conveniently. 

