import json
import os
import subprocess
import threading
from typing import Any


class PRVerificationState:
    def __init__(self):
        self.status = 'pending'  # pending, running, passed, failed
        self.checks = {
            'git_status_clean': 'Pending',
            'branch_pushed': 'Pending',
            'latest_upstream_fetched': 'Pending',
            'no_merge_conflicts': 'Pending',
            'tests_pass': 'Pending',
            'lint_pass': 'Pending',
            'type_checks_pass': 'Pending',
        }
        self.output = ''


global_pr_state = PRVerificationState()
lock = threading.Lock()


def get_poetry_path() -> str:
    home = os.path.expanduser('~')
    path = os.path.join(home, '.local', 'bin', 'poetry')
    if os.path.exists(path):
        return path
    return 'poetry'


def get_issue_context() -> dict[str, Any]:
    pr_dir = os.path.join(os.getcwd(), '.pr')
    file_path = os.path.join(pr_dir, 'issue_context.json')
    if os.path.exists(file_path):
        try:
            with open(file_path, 'r') as f:
                return json.load(f)
        except Exception:
            pass
    # Fallback default
    return {
        'repository': 'OpenHands/OpenHands',
        'issue_number': 15117,
        'issue_url': 'https://github.com/OpenHands/OpenHands/issues/15117',
        'issue_title': 'LLM is_subscription can be client-declared via the main /api/v1/settings endpoint (agent_settings_diff)',
    }


def save_issue_context(data: dict[str, Any]) -> None:
    pr_dir = os.path.join(os.getcwd(), '.pr')
    os.makedirs(pr_dir, exist_ok=True)
    file_path = os.path.join(pr_dir, 'issue_context.json')
    with open(file_path, 'w') as f:
        json.dump(data, f, indent=2)


def get_git_info() -> dict[str, Any]:
    issue = get_issue_context()
    try:
        branch = subprocess.run(
            ['git', 'rev-parse', '--abbrev-ref', 'HEAD'], capture_output=True, text=True
        ).stdout.strip()
        sha = subprocess.run(
            ['git', 'rev-parse', 'HEAD'], capture_output=True, text=True
        ).stdout.strip()
        status_out = subprocess.run(
            ['git', 'status', '--porcelain'], capture_output=True, text=True
        ).stdout.strip()
        is_clean = len(status_out) == 0

        # Files changed (relative to main)
        files_out = subprocess.run(
            ['git', 'diff', '--name-only', 'origin/main'],
            capture_output=True,
            text=True,
        ).stdout.strip()
        files_changed = [f for f in files_out.split('\n') if f]

        # Commits ahead
        commits_ahead = 0
        try:
            commits_ahead = int(
                subprocess.run(
                    ['git', 'rev-list', '--count', 'origin/main..HEAD'],
                    capture_output=True,
                    text=True,
                ).stdout.strip()
            )
        except Exception:
            pass

        # Check if pushed
        is_pushed = False
        try:
            local_sha = sha
            remote_sha = subprocess.run(
                ['git', 'rev-parse', f'origin/{branch}'], capture_output=True, text=True
            ).stdout.strip()
            is_pushed = local_sha == remote_sha
        except Exception:
            pass

        return {
            'branch': branch,
            'sha': sha,
            'is_clean': is_clean,
            'files_changed': files_changed,
            'commits_ahead': commits_ahead,
            'is_pushed': is_pushed,
            'issue': issue,
        }
    except Exception as e:
        return {
            'branch': 'unknown',
            'sha': 'unknown',
            'is_clean': False,
            'files_changed': [],
            'commits_ahead': 0,
            'is_pushed': False,
            'error': str(e),
            'issue': issue,
        }


def run_verification_sync():
    global global_pr_state

    poetry = get_poetry_path()
    info = get_git_info()

    # 1. git status clean
    if info['is_clean']:
        global_pr_state.checks['git_status_clean'] = 'Passed'
    else:
        global_pr_state.checks['git_status_clean'] = 'Failed'

    # 2. branch pushed
    if info['is_pushed']:
        global_pr_state.checks['branch_pushed'] = 'Passed'
    else:
        global_pr_state.checks['branch_pushed'] = 'Failed'

    # 3. latest upstream fetched
    try:
        subprocess.run(['git', 'fetch', 'origin'], check=True, capture_output=True)
        global_pr_state.checks['latest_upstream_fetched'] = 'Passed'
    except Exception:
        global_pr_state.checks['latest_upstream_fetched'] = 'Failed'

    # 4. no merge conflicts
    conflicts = subprocess.run(
        ['git', 'diff', '--name-only', '--diff-filter=U'],
        capture_output=True,
        text=True,
    ).stdout.strip()
    if not conflicts:
        global_pr_state.checks['no_merge_conflicts'] = 'Passed'
    else:
        global_pr_state.checks['no_merge_conflicts'] = 'Failed'

    # 5. lint passes (ruff check)
    try:
        res = subprocess.run(
            [
                poetry,
                'run',
                'ruff',
                'check',
                'openhands/app_server/settings/',
                'enterprise/server/routes/',
            ],
            capture_output=True,
            text=True,
        )
        if res.returncode == 0:
            global_pr_state.checks['lint_pass'] = 'Passed'
        else:
            global_pr_state.checks['lint_pass'] = 'Failed'
            global_pr_state.output += f'Ruff failure:\n{res.stdout}\n{res.stderr}\n'
    except Exception as e:
        global_pr_state.checks['lint_pass'] = 'Failed'
        global_pr_state.output += f'Ruff failed to run: {e}\n'

    # 6. type checks pass (mypy)
    try:
        res = subprocess.run(
            [
                poetry,
                'run',
                'mypy',
                'openhands/app_server/settings/settings_models.py',
                'enterprise/server/routes/org_models.py',
            ],
            capture_output=True,
            text=True,
        )
        if res.returncode == 0:
            global_pr_state.checks['type_checks_pass'] = 'Passed'
        else:
            global_pr_state.checks['type_checks_pass'] = 'Failed'
            global_pr_state.output += f'Mypy failure:\n{res.stdout}\n{res.stderr}\n'
    except Exception as e:
        global_pr_state.checks['type_checks_pass'] = 'Failed'
        global_pr_state.output += f'Mypy failed to run: {e}\n'

    # 7. all tests pass (pytest)
    try:
        res = subprocess.run(
            [
                poetry,
                'run',
                'pytest',
                'tests/unit/app_server/test_settings_api.py',
                'enterprise/tests/unit/server/routes/test_org_defaults_settings.py',
            ],
            capture_output=True,
            text=True,
        )
        if res.returncode == 0:
            global_pr_state.checks['tests_pass'] = 'Passed'
        else:
            global_pr_state.checks['tests_pass'] = 'Failed'
            global_pr_state.output += f'Pytest failure:\n{res.stdout}\n{res.stderr}\n'
    except Exception as e:
        global_pr_state.checks['tests_pass'] = 'Failed'
        global_pr_state.output += f'Pytest failed to run: {e}\n'

    # Determine overall status
    failed = any(v == 'Failed' for v in global_pr_state.checks.values())
    global_pr_state.status = 'failed' if failed else 'passed'
    global_pr_state.output += 'Verification completed.\n'


def start_verification():
    global global_pr_state
    with lock:
        if global_pr_state.status == 'running':
            return
        global_pr_state.status = 'running'
        for k in global_pr_state.checks:
            global_pr_state.checks[k] = 'Running'
        global_pr_state.output = 'Starting verification...\n'

    thread = threading.Thread(target=run_verification_sync)
    thread.daemon = True
    thread.start()


def run_push_branch() -> dict[str, Any]:
    info = get_git_info()
    branch = info['branch']
    if branch == 'unknown':
        return {'success': False, 'error': 'Could not detect branch name'}

    try:
        res = subprocess.run(
            ['git', 'push', 'origin', branch], capture_output=True, text=True
        )
        if res.returncode == 0:
            return {'success': True, 'output': res.stdout + res.stderr}
        else:
            return {'success': False, 'error': res.stderr or res.stdout}
    except Exception as e:
        return {'success': False, 'error': str(e)}
