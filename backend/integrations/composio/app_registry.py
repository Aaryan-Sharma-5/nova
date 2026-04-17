"""
Declares which Composio apps and actions NOVA uses.

Only metadata-level actions are listed — no message body access.
Action name strings match composio-core's Action enum values.
"""

SLACK_ACTIONS = [
    "SLACK_LIST_ALL_SLACK_TEAM_CHANNELS_WITH_VARIOUS_FILTERS",
    "SLACK_FETCH_CONVERSATION_HISTORY",
    "SLACK_RETRIEVE_DETAILED_USER_INFORMATION",
    "SLACK_RETRIEVE_USER_PROFILE_INFORMATION",
    # Legacy enums kept as fallback for older Composio environments.
    "SLACK_LIST_ALL_MESSAGES_IN_A_CHANNEL",
    "SLACK_GET_USERS_INFO",
]

GMAIL_ACTIONS = [
    "GMAIL_LIST_THREADS",
    "GMAIL_GET_THREAD",
]

GITHUB_ACTIONS = [
    "GITHUB_LIST_PULL_REQUESTS",
    "GITHUB_LIST_COMMITS",
]

JIRA_ACTIONS = [
    "JIRA_LIST_ISSUES_IN_PROJECT",
    "JIRA_GET_AN_ISSUE",
]

GCAL_ACTIONS = [
    "GOOGLECALENDAR_LIST_EVENTS",
]

# Map app name → list of action strings used by IngestionService
APP_ACTION_MAP: dict[str, list[str]] = {
    "slack":  SLACK_ACTIONS,
    "gmail":  GMAIL_ACTIONS,
    "github": GITHUB_ACTIONS,
    "jira":   JIRA_ACTIONS,
    "gcal":   GCAL_ACTIONS,
}

SUPPORTED_APPS = set(APP_ACTION_MAP.keys())
