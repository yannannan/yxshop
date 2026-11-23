import test from 'node:test';
import assert from 'node:assert/strict';
import { convertProspect, filterProspects, sampleCustomers, sampleProspects, websitePreview } from '../lib/ai-workspace-design.ts';

test('线索转客户保留来源与备注，重复操作不增加客户也不改写原始数据', () => {
  const prospect = { ...sampleProspects[0], note: 'Follow up next week' };
  const result = convertProspect(sampleCustomers, prospect);
  assert.equal(result.length, sampleCustomers.length + 1);
  assert.equal(result[0].status, 'converted');
  assert.equal(result[0].platform, prospect.platform);
  assert.equal(result[0].note, prospect.note);
  assert.equal(convertProspect(result, prospect), result);
  assert.equal(convertProspect(result, { ...prospect, id: 'other', email: prospect.email.toUpperCase() }), result);
  assert.equal(sampleProspects[0].status, 'qualified');
});

test('没有邮箱的两条线索可分别转客户，不因缺失字段合并', () => {
  const first = { ...sampleProspects[0], email: '' }, second = { ...sampleProspects[1], email: '' };
  const result = convertProspect(convertProspect([], first), second);
  assert.equal(result.length, 2);
});

test('平台数据搜索结合状态过滤，空结果和中英文行业字段可正确匹配', () => {
  assert.equal(filterProspects(sampleProspects, '  FACEBOOK ', 'qualified', 'zh-CN').length, 1);
  assert.equal(filterProspects(sampleProspects, '眼科', 'all', 'zh-CN').length, 1);
  assert.equal(filterProspects(sampleProspects, 'Ophthalmic', 'all', 'en').length, 1);
  assert.equal(filterProspects(sampleProspects, 'nonexistent', 'all', 'en').length, 0);
});

test('建站预览转义用户资料，保留业务文字并按语言和网站类型切换', () => {
  const input = { brand: '<script>alert(1)</script>', business: 'A&B', description: '<img src=x onerror=alert(2)>', language: 'en', style: 'teal', kind: 'trade' };
  const html = websitePreview(input);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('A&amp;B'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('lang="en"'));
  assert.ok(html.includes('Global partnerships'));
  assert.ok(html.includes('#087e83'));
  assert.ok(websitePreview({ ...input, language: 'zh-CN', kind: 'landing' }).includes('让每一次了解'));
});
