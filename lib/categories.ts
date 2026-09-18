export const categoryTree: Record<string, string[]> = {
  '会员充值服务': ['ChatGPT会员充值', 'Claude会员充值', 'Cursor会员充值', 'Grok会员充值', 'Gemini会员充值'],
  '会员租用': ['ChatGPT会员租用', 'Claude会员租用', 'Cursor会员租用', 'Grok会员租用', 'Gemini会员租用'],
  '会员拼车': ['ChatGPT会员租用', 'Claude会员租用', 'Cursor会员租用', 'Grok会员租用', 'Gemini会员租用'],
  '账号注册购买': ['ChatGPT账号购买', 'GoogleGmail邮箱购买', 'FaceBook账号购买', '美国Yahoo(开通POP)'],
  '验证码接收服务': ['国内验证码', '国际验证码'],
  '其他': ['其他服务'],
};

export const primaryCategoryNames = ['全部商品', ...Object.keys(categoryTree)];
