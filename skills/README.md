# Agent Skills

本目录包含可通过 [Skills CLI](https://skills.sh/) 安装的技能包。

## 安装方式

```bash
# 安装单个 skill（全局）
npx skills add yyandbug-coder/kitty-tools --skill <skill-name> -g -y

# pnpm
pnpm dlx skills add yyandbug-coder/kitty-tools --skill <skill-name> -g -y

# 安装仓库内全部 skills
npx skills add yyandbug-coder/kitty-tools --skill '*' -g -y
```

## 可用 Skills

| Skill | 说明 | 安装 |
|-------|------|------|
| [tauri-app-updater](./tauri-app-updater/) | Tauri v2 自动更新与发版（桌面 + 移动端） | `npx skills add yyandbug-coder/kitty-tools --skill tauri-app-updater -g -y` |
