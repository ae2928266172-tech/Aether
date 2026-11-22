"""服务器自动拉取更新脚本 deploy/autodeploy.sh：用假的 curl / 更新命令跑，不连网、不动服务器。"""
import os
import shutil
import subprocess
import tarfile
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "deploy" / "autodeploy.sh"
SHA1, SHA2 = "a" * 40, "b" * 40

pytestmark = pytest.mark.skipif(not shutil.which("bash") or not shutil.which("flock"), reason="需要 bash 和 flock")


def _env(tmp_path, sha, update_ok=True, ci="success"):
    bin_ = tmp_path / "bin"; bin_.mkdir(exist_ok=True)
    src = tmp_path / "pkg" / "Aether-x" / "backend" / "app"; src.mkdir(parents=True, exist_ok=True)
    (src / "main.py").write_text("")
    with tarfile.open(tmp_path / "pkg.tgz", "w:gz") as t:
        t.add(tmp_path / "pkg" / "Aether-x", arcname="Aether-x")
    # 假 curl：查分支返回 sha；下载代码包时复制本地包
    (bin_ / "curl").write_text(f"""#!/usr/bin/env bash
out=""; url=""
while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift 2;; -m|-H|--retry) shift 2;; -*) shift;; *) url="$1"; shift;; esac; done
echo "$url" >> {tmp_path}/calls
case "$url" in *check-runs*) cat {tmp_path}/ci;; *commits/*) printf '%s' "$(cat {tmp_path}/sha)";; *tar.gz/*) cp {tmp_path}/pkg.tgz "$out";; esac
""")
    (bin_ / "git").write_text("#!/usr/bin/env bash\nexit 1\n")
    upd = tmp_path / "update"
    upd.write_text(f"""#!/usr/bin/env bash
mkdir -p {tmp_path}/got && tar -xzf "$1" -C {tmp_path}/got && echo 更新输出
exit {0 if update_ok else 1}
""")
    for f in (bin_ / "curl", bin_ / "git", upd):
        f.chmod(0o755)
    (tmp_path / "sha").write_text(sha)
    _ci(tmp_path, ci)
    return {**os.environ, "PATH": f"{bin_}:{os.environ['PATH']}", "STATE": str(tmp_path / "state"),
            "PAUSE": str(tmp_path / "pause"), "UPDATE": str(upd)}


def _ci(tmp_path, conclusion):
    """假的 GitHub check-runs 结果；None 表示还没有这一项（测试还没开始）。"""
    import json
    runs = [] if conclusion is None else [
        {"id": 1, "status": "completed", "conclusion": "failure"},  # 之前一次没过；没有通过的就以最后一次为准
        {"id": 2, "status": "in_progress" if conclusion == "running" else "completed",
         "conclusion": None if conclusion == "running" else conclusion}]
    (tmp_path / "ci").write_text(json.dumps({"total_count": len(runs), "check_runs": runs}))


def run(env):
    return subprocess.run(["bash", str(SCRIPT)], env=env, capture_output=True, text=True)


def test_deploys_new_commit_once(tmp_path):
    env = _env(tmp_path, SHA1)
    r = run(env)
    assert r.returncode == 0, r.stderr
    assert "已更新到 aaaaaaa" in r.stdout
    assert (tmp_path / "got" / "backend" / "app" / "main.py").exists()  # 去掉了 codeload 包的顶层目录
    assert (tmp_path / "got" / "REVISION").read_text().strip() == SHA1
    assert (tmp_path / "state" / "deployed").read_text().strip() == SHA1
    shutil.rmtree(tmp_path / "got")
    assert run(env).returncode == 0 and not (tmp_path / "got").exists()  # 没有新提交：不动


def test_failed_commit_not_retried_and_pause(tmp_path):
    env = _env(tmp_path, SHA2, update_ok=False)
    r = run(env)
    assert r.returncode == 1 and "失败" in r.stdout
    assert (tmp_path / "state" / "failed").read_text().strip() == SHA2
    n = len((tmp_path / "calls").read_text().splitlines())
    assert run(env).returncode == 0
    assert len((tmp_path / "calls").read_text().splitlines()) == n + 1  # 只查了分支，没再下载
    (tmp_path / "pause").write_text("")
    (tmp_path / "sha").write_text(SHA1)
    r = run(env)
    assert "已暂停" in r.stdout and not (tmp_path / "state" / "deployed").exists()


def test_branch_missing_is_quiet(tmp_path):
    env = _env(tmp_path, "Not Found")
    r = run(env)
    assert r.returncode == 0 and "查不到" in r.stdout


def test_waits_for_ci_and_skips_failed_tests(tmp_path):
    env = _env(tmp_path, SHA1, ci=None)
    r = run(env)
    assert r.returncode == 0 and "等测试结果" in r.stdout and not (tmp_path / "got").exists()
    _ci(tmp_path, "running")
    assert "等测试结果" in run(env).stdout and not (tmp_path / "got").exists()
    _ci(tmp_path, "failure")
    r = run(env)
    assert r.returncode == 0 and "测试没通过" in r.stdout and not (tmp_path / "got").exists()
    assert (tmp_path / "state" / "ci-failed").read_text().strip() == SHA1
    assert not (tmp_path / "state" / "failed").exists()  # 不算更新失败：在 GitHub 上重新跑通过后还能上线
    _ci(tmp_path, "success")
    r = run(env)
    assert "已更新到 aaaaaaa" in r.stdout and (tmp_path / "got").exists()
    assert not (tmp_path / "state" / "ci-failed").exists()


def test_ci_wait_alerts_once_and_can_be_skipped(tmp_path):
    env = {**_env(tmp_path, SHA1, ci=None), "CI_WAIT_ALERT_MIN": "0", "ALERT_TO": "x@example.com"}
    bin_ = tmp_path / "bin"
    (bin_ / "msmtp").write_text(f"#!/usr/bin/env bash\ncat >> {tmp_path}/mail\n")
    (bin_ / "msmtp").chmod(0o755)
    run(env); run(env)
    assert (tmp_path / "mail").read_text().count("To: x@example.com") == 1  # 等太久只提醒一次
    r = run({**env, "REQUIRE_CI": "0"})  # 紧急情况可跳过测试检查
    assert "已更新到 aaaaaaa" in r.stdout
