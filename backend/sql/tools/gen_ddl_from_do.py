#!/usr/bin/env python3
"""
根据 MyBatis-Plus DO 实体类（@TableName）反向生成 MySQL 建表语句。

ruoyi-vue-pro 开源仓库里只带了 system/infra 的 SQL，商城（member/pay/mall）和 ERP 的建表 SQL
需要另外获取，这里直接从 DO 类生成一份可用的表结构。

用法：python3 gen_ddl_from_do.py <模块目录...> > out.sql
"""
import os
import re
import sys

BASE_COLUMNS = [
    "`creator` varchar(64) DEFAULT '' COMMENT '创建者'",
    "`create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'",
    "`updater` varchar(64) DEFAULT '' COMMENT '更新者'",
    "`update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'",
    "`deleted` bit(1) NOT NULL DEFAULT b'0' COMMENT '是否删除'",
]
TENANT_COLUMN = "`tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户编号'"

# 会被 "x = x + ?" 这类 SQL 累加的数值字段，需要默认 0，否则 NULL + n 仍为 NULL
ZERO_DEFAULT = re.compile(r'(count|stock|num|quantity|price|point|points|balance|amount|sort|times)$')
TEXT_NAMES = re.compile(r'(description|content|remark|text|detail|memo|config|data|params|result|response|package_info)$')
# 装修页面等 JSON 属性，内容可能超过 text 的 64KB
LONG_TEXT_NAMES = re.compile(r'(property)$')
URL_NAMES = re.compile(r'(url|urls|pic|pics|image|images|avatar|address)$')


def snake(name):
    return re.sub(r'(?<=[a-z0-9])([A-Z])', r'_\1', name).lower()


def strip_comments(src):
    src = re.sub(r'/\*.*?\*/', lambda m: ' ' * 0, src, flags=re.S)
    return re.sub(r'//[^\n]*', '', src)


def column_type(java_type, col, has_handler):
    if has_handler:
        return 'text'
    t = java_type.split('<')[0]
    if t in ('Long', 'long'):
        return 'bigint'
    if t in ('Integer', 'int', 'Short', 'short', 'Byte', 'byte'):
        return 'int'
    if t in ('Boolean', 'boolean'):
        return 'bit(1)'
    if t in ('Double', 'double', 'Float', 'float'):
        return 'double'
    if t == 'BigDecimal':
        return 'decimal(24,6)'
    if t in ('LocalDateTime', 'Date'):
        return 'datetime'
    if t == 'LocalDate':
        return 'date'
    if t == 'LocalTime':
        return 'time'
    if t == 'byte[]':
        return 'longblob'
    if t == 'String':
        if LONG_TEXT_NAMES.search(col):
            return 'longtext'
        if TEXT_NAMES.search(col):
            return 'text'
        if URL_NAMES.search(col):
            return 'varchar(1024)'
        return 'varchar(255)'
    return 'text'


def field_comments(raw):
    """取字段上方 Javadoc 的第一行作为列注释"""
    out = {}
    for m in re.finditer(r'/\*\*(.*?)\*/\s*((?:@[^\n]*\n\s*)*)private\s+[^;=]+?\s(\w+)\s*[;=]', raw, re.S):
        lines = [l.strip(' *\t') for l in m.group(1).splitlines()]
        lines = [l for l in lines if l and not l.startswith('@') and not l.startswith('{@')]
        if lines:
            out[m.group(3)] = lines[0][:200]
    return out


def parse(path):
    raw = open(path, encoding='utf-8').read()
    m = re.search(r'@TableName\(\s*(?:value\s*=\s*)?"([^"]+)"', raw)
    if not m:
        return None
    table = m.group(1)
    comments = field_comments(raw)
    src = strip_comments(raw)
    cls = re.search(r'public\s+class\s+(\w+)(?:\s+extends\s+(\w+))?', src)
    tenant_ignore = '@TenantIgnore' in src[:cls.start()]
    body_start = src.index('{', cls.end())
    depth, i, top = 0, body_start, []
    buf = ''
    # 只取类体第一层的内容，跳过内部类/方法
    while i < len(src):
        c = src[i]
        if c == '{':
            depth += 1
            if depth > 1:
                buf = ''
        elif c == '}':
            depth -= 1
            if depth == 0:
                break
            buf = ''
        elif depth == 1:
            buf += c
            if c == ';':
                top.append(buf)
                buf = ''
        i += 1
    cols, pk = [], None
    for stmt in top:
        stmt = stmt.strip()
        fm = re.search(r'(?:private|protected|public)\s+([\w<>\[\],\s?.]+?)\s+(\w+)\s*(=[^;]*)?;$', stmt, re.S)
        if not fm or re.search(r'\bstatic\b', stmt):
            continue
        anns = stmt[:fm.start()]
        if re.search(r'@TableField\([^)]*exist\s*=\s*false', anns):
            continue
        jtype, fname = fm.group(1).strip(), fm.group(2)
        cm = re.search(r'@TableField\(\s*(?:value\s*=\s*)?"([^"]+)"', anns)
        col = cm.group(1) if cm else snake(fname)
        has_handler = 'typeHandler' in anns
        ctype = column_type(jtype, col, has_handler)
        # 没有 @TableId 时，MyBatis-Plus 默认使用名为 id 的字段作为主键
        if '@TableId' in anns or (fname == 'id' and '@TableId' not in raw):
            auto = 'IdType.INPUT' not in anns and ctype == 'bigint'
            cols.append(f"`{col}` {ctype} NOT NULL{' AUTO_INCREMENT' if auto else ''} COMMENT '编号'")
            pk = col
            continue
        default = ' DEFAULT 0' if ctype in ('int', 'bigint', 'decimal(24,6)') and ZERO_DEFAULT.search(col) else ' DEFAULT NULL'
        if ctype in ('text', 'longtext', 'longblob'):
            default = ''
        note = comments.get(fname, '').replace("'", "''")
        cols.append(f"`{col}` {ctype}{default}" + (f" COMMENT '{note}'" if note else ''))
    parent = cls.group(2)
    if parent in ('BaseDO', 'TenantBaseDO'):
        cols += BASE_COLUMNS
    if not tenant_ignore:
        cols.append(TENANT_COLUMN)
    if pk is None:
        return None
    lines = ',\n  '.join(cols + [f'PRIMARY KEY (`{pk}`)'])
    return table, (f"DROP TABLE IF EXISTS `{table}`;\nCREATE TABLE `{table}` (\n  {lines}\n)"
                   f" ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n")


def main():
    out = {}
    for root_dir in sys.argv[1:]:
        for root, _, files in os.walk(root_dir):
            if '/test/' in root:
                continue
            for f in files:
                if f.endswith('DO.java'):
                    r = parse(os.path.join(root, f))
                    if r:
                        out[r[0]] = r[1]
    print('SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n')
    for t in sorted(out):
        print(out[t])
    print('SET FOREIGN_KEY_CHECKS = 1;')


if __name__ == '__main__':
    main()
