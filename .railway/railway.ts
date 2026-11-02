import { defineRailway, github, project, service } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "prestoteca";
export default defineRailway(() => {
  const prestoteca = service("prestoteca", {
    source: github("HRamiroAlbornoz/prestoteca", { branch: "main", checkSuites: false }),
    build: { buildEnvironment: "V3", builder: "RAILPACK" },
    start: "cd server && npm start",
    healthcheck: "/api/health",
    healthcheckTimeout: 300,
    replicas: { "us-east4-eqdc4a": 1 },
  });

  return project("prestoteca", {
    variables: { managed: false },
    resources: [prestoteca],
  });
});
