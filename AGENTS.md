## Delivery 

At each step of a delivery this project should produce a _working_ npm-publishable artifact.

All commands in the CLI should work (even if by work that is to print a 'Not implemented' message). 

That is: an `npx thunderjar init` should produce code that does not have import or type errors. 


### Committing and tests 

Do not leave code uncommited. Always commit changes before handing back to the user. 

Commit changes in sensible blocks. Use your judgement as to whether an `--amend` commit is appropriate. 

If being provided feedback for behaviour to change: 

- Write a test that will detect the behaviour first, and commit it with a message starting with the 🔴 emoji to indicate the failing test. 
- Write the fix and commit it with a message starting with the 🟢 emoji. 



