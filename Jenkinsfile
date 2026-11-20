@Library('iquops') _

iquopsPipeline(
  nodeImage: 'node:22-bookworm-slim',
  installCommand: 'npm ci',
  testCommand: 'npm test',
  buildCommand: 'npm run build',
  dockerfile: 'Dockerfile',
  context: '.',
  healthPath: '/health'
)
