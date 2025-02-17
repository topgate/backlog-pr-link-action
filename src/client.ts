import * as core from '@actions/core'
import 'isomorphic-fetch'
import 'isomorphic-form-data'
import { Backlog } from 'backlog-js'

const PR_FIELD_NAME = 'Pull Request'
const PR_STATUS_FIELD_NAME = 'PR Status'

export interface CustomField {
  id: number;
  name: string;
  value?: string | null;
}

export class Client {
  private host: string;
  private backlog: Backlog;

  constructor (host: string, apiKey: string) {
    this.host = host
    this.backlog = new Backlog({ host, apiKey })
  }

  containsBacklogUrl (body: string): boolean {
    return this.urlRegex.test(body)
  }

  parseBacklogUrl (body: string): Array<string> {
    const matchAry = body.match(this.urlRegex)
    if (matchAry == null) return []

    const [url, projectId, issueNo] = matchAry
    return [url, projectId, `${projectId}-${issueNo}`]
  }

  async validateProject (projectId: string): Promise<boolean> {
    try {
      await this.backlog.getProject(projectId)
      return true
    } catch {
      return false
    }
  }

  async getPrCustomField (projectId: string): Promise<CustomField | undefined> {
    const fields: Array<CustomField> = await this.backlog.getCustomFields(
      projectId
    )
    const prField: CustomField | undefined = fields.find(
      (field: CustomField) => field.name === PR_FIELD_NAME
    )
    return prField
  }

  async setPrCustomField (projectId: string): Promise<CustomField> {
    const created = await this.backlog.postCustomField(projectId, {
      name: PR_FIELD_NAME,
      typeId: 1, // text
      description: 'Filed for Pull request URL.'
    })
    return created as CustomField
  }

  async getPrStatusCustomField (projectId: string): Promise<CustomField | undefined> {
    const fields: Array<CustomField> = await this.backlog.getCustomFields(
      projectId
    )
    const prField: CustomField | undefined = fields.find(
      (field: CustomField) => field.name === PR_STATUS_FIELD_NAME
    )
    return prField
  }

  async setPrStatusCustomField (projectId: string): Promise<CustomField> {
    const created = await this.backlog.postCustomField(projectId, {
      name: PR_STATUS_FIELD_NAME,
      typeId: 1, // text
      description: 'Filed for Pull request status.'
    })
    return created as CustomField
  }

  async updateIssuePrField (
    issueId: string,
    prFieldId: number,
    prUrl: string
  ): Promise<boolean> {
    let currentPrField: CustomField

    try {
      currentPrField = await this.getCurrentPrField(issueId, prFieldId)
    } catch (error) {
      core.error(error.message)
      core.warning(`Invalid IssueID: ${issueId}`)
      return false
    }

    if ((currentPrField.value || '').includes(prUrl)) {
      core.info(`Pull Request (${prUrl}) is already linked.`)
      return false
    }

    try {
      const updateValue: string = currentPrField.value
        ? `${currentPrField.value}\n${prUrl}`
        : prUrl
      await this.backlog.patchIssue(issueId, {
        [`customField_${currentPrField.id}`]: updateValue
      })
      return true
    } catch (error) {
      core.error(error.message)
      return false
    }
  }

  async updateIssuePrStatusField (
    issueId: string,
    prStatusFieldId: number,
    prStatus: string
  ): Promise<boolean> {
    let currentPrStatusField: CustomField

    try {
      currentPrStatusField = await this.getCurrentPrField(issueId, prStatusFieldId)
    } catch (error) {
      core.error(error.message)
      core.warning(`Invalid IssueID: ${issueId}`)
      return false
    }

    if (currentPrStatusField.value === prStatus) {
      core.info(`PR Status(${prStatus}) is already linked.`)
      return false
    }

    try {
      await this.backlog.patchIssue(issueId, {
        [`customField_${currentPrStatusField.id}`]: prStatus
      })
      return true
    } catch (error) {
      core.error(error.message)
      return false
    }
  }

  async getCurrentPrField (
    issueId: string,
    prFieldId: number
  ): Promise<CustomField> {
    const issue = await this.backlog.getIssue(issueId)
    const prField: CustomField = issue.customFields.find(
      (field: CustomField) => field.id === prFieldId
    )
    return prField
  }

  async getCurrentPrStatusField (
    issueId: string,
    prStatusFieldId: number
  ): Promise<CustomField> {
    const issue = await this.backlog.getIssue(issueId)
    const prStatusField: CustomField = issue.customFields.find(
      (field: CustomField) => field.id === prStatusFieldId
    )
    return prStatusField
  }

  private get urlRegex (): RegExp {
    return new RegExp(`https://${this.host}/view/(\\w+)-(\\d+)`)
  }
}
