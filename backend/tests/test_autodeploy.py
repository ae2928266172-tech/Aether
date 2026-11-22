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


def _env(tmp_path, sha, update_ok=True):
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
case "$url" in *commits/*) printf '%s' "$(cat {tmp_path}/sha)";; *tar.gz/*) cp {tmp_path}/pkg.tgz "$out";; esac
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
    return {**os.environ, "PATH": f"{bin_}:{os.environ['PATH']}", "STATE": str(tmp_path / "state"),
            "PAUSE": str(tmp_path / "pause"), "UPDATE": str(upd)}


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
