import type {
  Bookmark,
  Category,
  MemoItem,
  SearchEngine,
  Settings,
  SubCategory,
  SubSection,
  TotpItem,
} from '../types'

export const SEARCH_ENGINES: SearchEngine[] = [
  {
    id: 'google',
    name: 'Google',
    searchUrl: 'https://www.google.com/search?q=%s',
    icon: 'google',
  },
  {
    id: 'bing',
    name: 'Bing',
    searchUrl: 'https://www.bing.com/search?q=%s',
    icon: 'bing',
  },
  {
    id: 'baidu',
    name: '百度',
    searchUrl: 'https://www.baidu.com/s?wd=%s',
    icon: 'baidu',
  },
  {
    id: 'stackoverflow',
    name: 'StackOverf...',
    searchUrl: 'https://stackoverflow.com/search?q=%s',
    icon: 'stackoverflow',
  },
  {
    id: 'segmentfault',
    name: 'SegmentF...',
    searchUrl: 'https://segmentfault.com/search?q=%s',
    icon: 'segmentfault',
  },
  {
    id: 'github',
    name: 'GitHub',
    searchUrl: 'https://github.com/search?q=%s',
    icon: 'github',
  },
]

export const WALLPAPER_PRESETS = [
  {
    id: 'eva-sky',
    name: 'EVA 蓝天城市 (截图风格)',
    url: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=1920&q=80',
  },
  {
    id: 'anime-cloud',
    name: '都市天际线晴空',
    url: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?w=1920&q=80',
  },
  {
    id: 'cyberpunk',
    name: '赛博朋克夜色',
    url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1920&q=80',
  },
  {
    id: 'scenic-lake',
    name: '山水风景',
    url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1920&q=80',
  },
]

export const DEFAULT_SETTINGS: Settings = {
  activeCategoryId: 'cat-prod',
  activeSearchEngineId: 'google',
  activeSubSectionId: 'sec-tools',
  activeSubCategoryId: 'sub-mail',
  activeWidgetTab: 'memo',
  wallpaperUrl: WALLPAPER_PRESETS[0].url,
  wallpaperBlur: 0,
  wallpaperDim: 15,
  panelOpacity: 92,
  cardOpacity: 98,
  isSortMode: false,
  showNotice: true,
  cornerRadius: 'none',
  iconShape: 'square',
  fontSize: 13,
  isBold: false,
  isItalic: false,
  textColor: '#1f2937',
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  customFontUrl: '',
  showBookmarkIcon: true,
  columnMode: 'manual',
  manualColumns: 7,
  cardWidth: 1380,
  avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=star&backgroundColor=ffd5dc',
  userName: 'Nav 探索者',
  highlightColor: '#2563eb',
  weatherCity: '杭州',
  themeMode: 'light',
  fallbackIconMode: 'letter',
  defaultPlaceholderIconUrl: '',
}

export function defaultCategories(): Category[] {
  return [
    { id: 'cat-prod', name: '生产力工具', color: '#3b82f6', order: 0 },
    { id: 'cat-interest', name: '兴趣相关', color: '#ec4899', order: 1 },
    { id: 'cat-tech', name: '技术相关', color: '#10b981', order: 2 },
    { id: 'cat-todo', name: 'TODO课程', color: '#22c55e', order: 3 },
    { id: 'cat-blog', name: '优质博客', color: '#f43f5e', order: 4 },
    { id: 'cat-fun', name: '闲着玩的', color: '#f97316', order: 5 },
    { id: 'cat-doc', name: 'Docume', color: '#eab308', order: 6 },
    { id: 'cat-nocase', name: 'nocase', color: '#ec4899', order: 7 },
  ]
}

export function defaultSubSections(): SubSection[] {
  return [
    { id: 'sec-tools', name: '工具', icon: 'wrench', order: 0 },
    { id: 'sec-life', name: '生活', icon: 'coffee', order: 1 },
    { id: 'sec-leisure', name: '休闲', icon: 'gamepad', order: 2 },
    { id: 'sec-multi', name: '多级分类', icon: 'folder', order: 3 },
  ]
}

export function defaultSubCategories(): SubCategory[] {
  return [
    { id: 'sub-mail', sectionId: 'sec-tools', name: '邮箱', icon: 'mail', order: 0 },
    { id: 'sub-draw', sectionId: 'sec-tools', name: '绘图', icon: 'pen-tool', order: 1 },
    { id: 'sub-trans', sectionId: 'sec-tools', name: '翻译', icon: 'languages', order: 2 },

    { id: 'sub-shopping', sectionId: 'sec-life', name: '购物', icon: 'shopping-cart', order: 0 },
    { id: 'sub-travel', sectionId: 'sec-life', name: '出行', icon: 'compass', order: 1 },

    { id: 'sub-games', sectionId: 'sec-leisure', name: '游戏', icon: 'gamepad', order: 0 },
    { id: 'sub-video', sectionId: 'sec-leisure', name: '影音', icon: 'film', order: 1 },

    { id: 'sub-dev-res', sectionId: 'sec-multi', name: '开发资源', icon: 'code', order: 0 },
    { id: 'sub-server', sectionId: 'sec-multi', name: '服务器/运维', icon: 'server', order: 1 },
  ]
}

export function defaultBookmarks(): Bookmark[] {
  const now = Date.now()

  // Main production bookmarks (exact from screenshot)
  const prodItems = [
    { title: 'Github', url: 'https://github.com' },
    { title: 'LINUX DO', url: 'https://linux.do' },
    { title: 'Machines - Tailscale', url: 'https://login.tailscale.com' },
    { title: 'paper_with_code', url: 'https://paperswithcode.com' },
    { title: '粘贴板', url: 'https://pastebin.com' },
    { title: '163邮箱', url: 'https://mail.163.com' },
    { title: 'QQ邮箱', url: 'https://mail.qq.com' },

    { title: 'LeetCode', url: 'https://leetcode.cn' },
    { title: '百度网盘', url: 'https://pan.baidu.com' },
    { title: '小红书', url: 'https://www.xiaohongshu.com' },
    { title: 'discord', url: 'https://discord.com' },
    { title: '画图', url: 'https://excalidraw.com' },
    { title: 'tg', url: 'https://web.telegram.org' },
    { title: 'GPU', url: 'https://runpod.io' },

    { title: 'CCF', url: 'https://www.ccf.org.cn' },
    { title: '虎牙直播', url: 'https://www.huya.com' },
    { title: '斗鱼直播', url: 'https://www.douyu.com' },
    { title: '新浪微博', url: 'https://weibo.com' },
    { title: 'Youtube', url: 'https://www.youtube.com' },
    { title: '网易云音乐', url: 'https://music.163.com' },
    { title: '知乎', url: 'https://www.zhihu.com' },

    { title: '掘金', url: 'https://juejin.cn' },
    { title: '杭电计算机学院', url: 'https://computer.hdu.edu.cn' },
    { title: '杭电VPN', url: 'https://vpn.hdu.edu.cn' },
    { title: '杭电研究院', url: 'https://yjs.hdu.edu.cn' },
    { title: '数字杭电', url: 'https://cas.hdu.edu.cn' },
    { title: '学术', url: 'https://scholar.google.com' },
    { title: '语雀', url: 'https://www.yuque.com' },

    { title: '高德地图', url: 'https://www.amap.com' },
    { title: '笔记', url: 'https://notion.so' },
    { title: '腾讯文档', url: 'https://docs.qq.com' },
    { title: '代码片段生产', url: 'https://gist.github.com' },
    { title: '学术GPT', url: 'https://chatgpt.com' },
    { title: '学信网', url: 'https://www.chsi.com.cn' },
    { title: 'CloseAI', url: 'https://openai.com' },

    { title: 'SimpleTex - Snip', url: 'https://simpletex.cn' },
    { title: 'kaggle', url: 'https://www.kaggle.com' },
    { title: 'Matrix 社区 - 分享', url: 'https://matrix.org' },
    { title: 'flomo', url: 'https://v.flomoapp.com' },
    { title: 'IT-Tools', url: 'https://it-tools.tech' },
    { title: '飞书', url: 'https://www.feishu.cn' },
    { title: '让计算更简单 | 阿里云', url: 'https://www.aliyun.com' },

    { title: 'Canva在线设计', url: 'https://www.canva.cn' },
    { title: '计算机技术职业资格', url: 'https://www.ruankao.org.cn' },
    { title: '快手校招', url: 'https://campus.kuaishou.cn' },
    { title: '蚂蚁', url: 'https://www.antgroup.com' },
    { title: '阿里云校园招聘', url: 'https://talent.aliyun.com' },
    { title: '服务器', url: 'https://console.cloud.tencent.com' },
    { title: 'KOOK', url: 'https://www.kookapp.cn' },

    { title: 'Challenges', url: 'https://codeforces.com' },
    { title: '哔哩哔哩', url: 'https://www.bilibili.com' },
    { title: 'ATK HUB', url: 'https://github.com' },
    { title: '牛客网', url: 'https://www.nowcoder.com' },
    { title: 'Boss直聘', url: 'https://www.zhipin.com' },
    { title: 'HDU研究生服务', url: 'https://yjs.hdu.edu.cn' },
    { title: 'Semantic Scholar', url: 'https://www.semanticscholar.org' },

    { title: '谷歌学术', url: 'https://scholar.google.com' },
    { title: 'Luban Sms - 阿里云', url: 'https://sms.aliyun.com' },
    { title: 'V2EX', url: 'https://www.v2ex.com' },
  ]

  const bookmarks: Bookmark[] = prodItems.map((item, index) => ({
    id: `bm-prod-${index}`,
    categoryId: 'cat-prod',
    title: item.title,
    url: item.url,
    order: index,
    isFavorite: index < 14,
    createdAt: now + index,
    updatedAt: now + index,
  }))

  // Bottom sub-category bookmarks
  const mailItems = [
    { title: 'QQ邮箱', url: 'https://mail.qq.com' },
    { title: '163邮箱', url: 'https://mail.163.com' },
    { title: '126邮箱', url: 'https://mail.126.com' },
    { title: 'Gmail', url: 'https://mail.google.com' },
    { title: '新浪邮箱', url: 'https://mail.sina.com.cn' },
    { title: 'Hotmail', url: 'https://outlook.live.com' },
    { title: '139邮箱', url: 'https://mail.10086.cn' },
    { title: '阿里邮箱', url: 'https://mail.aliyun.com' },
    { title: '哔哩哔哩', url: 'https://www.bilibili.com' },
  ]

  mailItems.forEach((item, index) => {
    bookmarks.push({
      id: `bm-mail-${index}`,
      subCategoryId: 'sub-mail',
      title: item.title,
      url: item.url,
      order: index,
      createdAt: now + 100 + index,
      updatedAt: now + 100 + index,
    })
  })

  const drawItems = [
    { title: 'ProcessOn', url: 'https://www.processon.com' },
    { title: '百度脑图', url: 'https://naotu.baidu.com' },
    { title: '幕布', url: 'https://mubu.com' },
    { title: '迅捷画图', url: 'https://www.liuchengtu.com' },
    { title: '小画桌', url: 'https://www.xiaohuazhuo.com' },
    { title: 'ZhiMap脑图', url: 'https://zhimap.com' },
    { title: '凹脑图', url: 'https://aonaotu.com' },
    { title: 'GitMind脑图流程图', url: 'https://gitmind.cn' },
  ]

  drawItems.forEach((item, index) => {
    bookmarks.push({
      id: `bm-draw-${index}`,
      subCategoryId: 'sub-draw',
      title: item.title,
      url: item.url,
      order: index,
      createdAt: now + 200 + index,
      updatedAt: now + 200 + index,
    })
  })

  const transItems = [
    { title: '谷歌翻译', url: 'https://translate.google.com' },
    { title: '有道翻译', url: 'https://fanyi.youdao.com' },
    { title: '百度翻译', url: 'https://fanyi.baidu.com' },
    { title: '搜狗翻译', url: 'https://fanyi.sogou.com' },
    { title: '金山词霸', url: 'https://www.iciba.com' },
    { title: '必应翻译', url: 'https://www.bing.com/translator' },
    { title: '欧路词典', url: 'https://dict.eudic.net' },
    { title: '海词', url: 'https://dict.cn' },
  ]

  transItems.forEach((item, index) => {
    bookmarks.push({
      id: `bm-trans-${index}`,
      subCategoryId: 'sub-trans',
      title: item.title,
      url: item.url,
      order: index,
      createdAt: now + 300 + index,
      updatedAt: now + 300 + index,
    })
  })

  return bookmarks
}

export function defaultMemos(): MemoItem[] {
  const now = Date.now()
  return [
    { id: 'memo-1', text: 'Suffering of screw', done: false, createdAt: now - 3600000 * 24 },
    { id: 'memo-2', text: 'NightTheater', done: false, createdAt: now - 3600000 * 12 },
    { id: 'memo-3', text: '学习 React 19 新特性与动画', done: false, createdAt: now - 3600000 * 6 },
    { id: 'memo-4', text: '整理收藏夹常用工具分类', done: true, createdAt: now - 3600000 },
  ]
}

export function defaultTotpAccounts(): TotpItem[] {
  const now = Date.now()
  return [
    {
      id: 'totp-1',
      name: 'GitHub (示例 2FA)',
      issuer: 'GitHub',
      secret: 'JBSWY3DPEHPK3PXP',
      createdAt: now,
    },
    {
      id: 'totp-2',
      name: 'Google (示例 2FA)',
      issuer: 'Google',
      secret: 'MFRGGZDFMZTWQ2LK',
      createdAt: now + 1,
    },
  ]
}
