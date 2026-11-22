# Roadmap


Thunderjar is in active alpha development. 

The tool works, I am using it to conduct experiments, and the conceptual model is mostly settled. 

Breaking changes are still to be expected. 

The kinds of breaking changes to expect are: 

- The thunderjar artifacts (docker images and metadata) may change
- Configuration files take a different format. 

## Things that you can expect not to be working particularly well

- There are some issues relating to graceful failures when running on remotes, particularly at high levels of concurrency
- The browser UI is sparse 
- The documentation is largely stubs


## To do before beta

- Easy setup helper functions for the four supported harnesses (Claude, Codex, Copilot, OpenCode) exist
- Easy meausuring instruments exist 
- All documentation created
- Some minimal amount of useful browser UX exists 
- Remote runs reliable enough 


## During beta

After at least one year of being in beta, v1 will be released. 

During the beta, I will be using the tool in regular use and adding features and tweaks as needed, and responding to user feedbacks. 

During this time, greater effort will be made to avoid or batch breaking changes, and I will endevour to provide easy migration paths. 




