- code state should include `bun i` if it doesn't already (or bun ci?) 

- There is an issue where a lot of tasks only make sense relative to certain starting states. 
- I think this is ok. I think we have a: 
```
dependsOn: ["code-state-a", "code-state-b"]
```

And thunderjar will just reject if it's not one of those. 

- We're going to need these skills 
    - tj-codestate 
    - tj-promptset


- declaring measurements might be a bit verbose. Maybe can declare an array of measurments?

