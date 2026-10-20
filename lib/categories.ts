export type CategoryNode = {
  name: string;
  children: CategoryNode[];
};

export const categoryTree: CategoryNode[] = [
  {
    name: '账号服务',
    children: [
      { name: '会员充值服务', children: [
        { name: 'ChatGPT会员充值', children: [] },
        { name: 'Claude会员充值', children: [] },
        { name: 'Cursor会员充值', children: [] },
        { name: 'Grok会员充值', children: [] },
        { name: 'Gemini会员充值', children: [] },
      ] },
      { name: '会员租用', children: [
        { name: 'ChatGPT会员租用', children: [] },
        { name: 'Claude会员租用', children: [] },
        { name: 'Cursor会员租用', children: [] },
        { name: 'Grok会员租用', children: [] },
        { name: 'Gemini会员租用', children: [] },
      ] },
      { name: '会员拼车', children: [
        { name: 'ChatGPT会员租用', children: [] },
        { name: 'Claude会员租用', children: [] },
        { name: 'Cursor会员租用', children: [] },
        { name: 'Grok会员租用', children: [] },
        { name: 'Gemini会员租用', children: [] },
      ] },
      { name: '账号注册购买', children: [
        { name: 'ChatGPT账号购买', children: [] },
        { name: 'GoogleGmail邮箱购买', children: [] },
        { name: 'FaceBook账号购买', children: [] },
        { name: '美国Yahoo(开通POP)', children: [] },
      ] },
      { name: '其他', children: [{ name: '其他服务', children: [] }] },
    ],
  },
  { name: '工具服务', children: [] },
  {
    name: '验证码服务',
    children: [
      {
        name: '验证码接收服务',
        children: [
          { name: '国内验证码', children: [] },
          { name: '国际验证码', children: [] },
        ],
      },
    ],
  },
];

export const primaryCategoryNames = ['全部商品', ...categoryTree.map((item) => item.name)];
