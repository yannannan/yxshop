#!/usr/bin/env bash
# 供原生安装脚本 source；兼容 CentOS 7 curl 7.29，不单独发布或启停应用。
video_download() {
    local url="$1" destination="$2" maximum="$3" partial="$2.part"
    local attempt code http size path
    [[ "$url" == https://* && "$maximum" =~ ^[1-9][0-9]*$ ]] || { echo '视频依赖下载参数无效' >&2; return 1; }
    for path in "$destination" "$partial"; do
        [[ ! -L "$path" && ( ! -e "$path" || -f "$path" ) ]] || { echo "下载文件不能是链接或目录：$path" >&2; return 1; }
        if [[ -f "$path" ]]; then
            size="$(wc -c <"$path")"
            (( size <= maximum )) || { echo "下载文件超过允许大小：$path" >&2; return 1; }
        fi
    done
    if [[ -s "$destination" ]]; then echo "复用已下载文件 $(basename -- "$destination")，后续仍验证官方签名。"; return 0; fi
    for (( attempt=1; attempt<=3; attempt++ )); do
        size=0
        [[ ! -f "$partial" ]] || size="$(wc -c <"$partial")"
        echo "下载 $(basename -- "$destination")，从 $size 字节继续（第 $attempt/3 次；连续120秒无数据才超时）。"
        # 不使用 curl 内建重试：旧版本重试会丢弃本次写入的内容。
        # 每次重新执行 -C -，从磁盘上的实际进度续传；持续慢速传输不限总时长。
        if http="$(curl --disable --fail --location --show-error --connect-timeout 20 \
            --speed-limit 1 --speed-time 120 --continue-at - --header 'Accept-Encoding: identity' \
            --proto '=https' --proto-redir '=https' --max-filesize "$maximum" \
            --output "$partial" --write-out '%{http_code}' "$url")"; then code=0; else code=$?; fi
        if [[ -f "$partial" ]]; then
            size="$(wc -c <"$partial")"
            if (( size > maximum )); then rm -f -- "$partial"; echo '下载超出大小限制，未使用文件' >&2; return 1; fi
        fi
        if (( code == 0 )) && [[ "$http" == 200 || "$http" == 206 ]] && [[ -s "$partial" ]]; then
            mv -f -- "$partial" "$destination" || return 1
            return 0
        fi
        if (( code == 33 )) || [[ "$http" == 416 ]]; then
            echo '该地址拒绝当前续传范围，下一次安全地从头下载。' >&2
            rm -f -- "$partial" || return 1
        else
            echo "下载未完成（curl=$code，HTTP=$http），已保留断点。" >&2
        fi
        if (( attempt < 3 )); then sleep "$(( attempt * 2 ))"; fi
    done
    echo "下载三次失败，下次运行仍可继续：$partial" >&2
    return 1
}
