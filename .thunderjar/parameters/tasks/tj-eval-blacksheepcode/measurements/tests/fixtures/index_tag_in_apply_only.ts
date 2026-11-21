import { declareCodeState } from "thunderjar";

export default declareCodeState({
  config: { repo: "https://github.com/dwjohnston/blacksheepcode.git" },
  applyParameter: (config) => `RUN git clone ${config.repo} /workspace && git -C /workspace checkout tj-codestate-1`,
});
