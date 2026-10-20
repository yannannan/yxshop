#!/bin/bash

set -e

echo "======================================"
echo " 宇星商城 yxshop 自动升级"
echo "======================================"

echo "[1/6] 停止服务..."
./stop.sh || true

echo "[2/6] 获取最新代码..."
git fetch origin

echo "[3/6] 同步 origin/master..."
git reset --hard origin/master

echo "[4/6] 安装项目依赖..."
pnpm install --frozen-lockfile

echo "[5/6] 构建生产版本..."
pnpm build

echo "[6/6] 启动服务..."
./start.sh

echo "======================================"
echo " yxshop 升级发布完成"
echo "======================================"