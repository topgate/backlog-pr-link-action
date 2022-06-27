import * as core from '@actions/core'
import { context, getOctokit } from '@actions/github'
import { Client, CustomField } from './client'

async function main () {
  try {
    const host = core.getInput('backlog-host', { required: true })
    const apiKey = core.getInput('backlog-api-key', { required: true })

    if (context.payload.pull_request === undefined) {
      throw new Error("Can't get pull_request payload. Check you trigger pull_request event")
    }

    const client = new Client(host, apiKey)
    const { html_url: prUrl = '', body = '' } = context.payload.pull_request
    if (!client.containsBacklogUrl(body)) {
      core.info("Skip process since body doesn't contain backlog URL")
      return
    }

    const [backlogUrl, projectId, issueId] = client.parseBacklogUrl(body)
    if (backlogUrl === undefined) {
      core.info('Skip process since no backlog URL found')
      return
    }
    if (!await client.validateProject(projectId)) {
      core.warning(`Invalid ProjectID: ${projectId}`)
      return
    }

    {
      core.info(`Trying to link the Pull Request to ${backlogUrl}`)

      let prCustomField: CustomField | undefined = await client.getPrCustomField(projectId)
      if (prCustomField === undefined) {
        core.info('Create pr custom filed "Pull Request"')
        prCustomField = await client.setPrCustomField(projectId)
        if (!prCustomField) {
          core.warning('Skip process since "Pull Request" custom field not found')
          return
        }
      }

      if (await client.updateIssuePrField(issueId, prCustomField.id, prUrl)) {
        core.info(`Pull Request (${prUrl}) has been successfully linked.`)
      }
    }

    {
      core.info(`Trying to link the PR Status to ${backlogUrl}`)
      const octoKit = getOctokit(core.getInput('secret'))

      const pr = await octoKit.pulls.get({
        ...context.repo,
        pull_number: context.payload.pull_request.number
      })
      const status = pr.data.merged ? 'merged' : pr.data.state

      let prStatusCustomField: CustomField | undefined = await client.getPrStatusCustomField(projectId)
      if (prStatusCustomField === undefined) {
        core.info('Create pr custom filed "PR Status"')
        prStatusCustomField = await client.setPrStatusCustomField(projectId)
        if (!prStatusCustomField) {
          core.warning('Skip process since "PR Status" custom field not found')
          return
        }
      }

      if (await client.updateIssuePrStatusField(issueId, prStatusCustomField.id, status)) {
        core.info(`PR Status (${status}) has been successfully linked.`)
      }
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

main()
