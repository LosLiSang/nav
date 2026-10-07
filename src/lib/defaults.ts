import type {
  Bookmark,
  Category,
  MemoItem,
  SearchEngine,
  Settings,
  SubCategory,
  SubSection,
  SuperPinnedLink,
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
  activeWidgetTab: 'calendar',
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
  highlightColor: '#ff6900',
  weatherCity: '杭州',
  weatherProvider: 'open-meteo',
  weatherApiKey: '',
  weatherCustomUrl: '',
  weatherCustomFieldPath: '',
  weatherCustomTempPath: '',
  weatherAutoRefreshMinutes: 30,
  themeMode: 'light',
  fallbackIconMode: 'letter',
  defaultPlaceholderIconUrl: '',
  showRightSidebar: true,
  rightSidebarCollapsed: false,
  showLeftSidebar: false,
  leftSidebarCollapsed: true,
  searchFilterBookmarks: true,
}

export function defaultCategories(): Category[] {
  return [
    { id: 'cat-prod', name: '常用推荐', color: '#ff6900', order: 0 },
    { id: 'cat-tech', name: '技术开发', color: '#3b82f6', order: 1 },
    { id: 'cat-blog', name: '优质博客', color: '#f43f5e', order: 2 },
    { id: 'cat-study', name: '学习资源', color: '#10b981', order: 3 },
    { id: 'cat-tools', name: '效率工具', color: '#8b5cf6', order: 4 },
    { id: 'cat-leisure', name: '生活娱乐', color: '#ec4899', order: 5 },
    { id: 'cat-doc', name: '文档手册', color: '#eab308', order: 6 },
  ]
}

export function defaultSubSections(): SubSection[] {
  return [
    { id: 'sec-tools', name: '工具', icon: 'wrench', order: 0 },
    { id: 'sec-life', name: '生活', icon: 'coffee', order: 1 },
    { id: 'sec-leisure', name: '休闲', icon: 'gamepad', order: 2 },
    { id: 'sec-dev', name: '开发运维', icon: 'server', order: 3 },
  ]
}

export function defaultSubCategories(): SubCategory[] {
  return [
    { id: 'sub-mail', sectionId: 'sec-tools', name: '邮箱', icon: 'mail', order: 0 },
    { id: 'sub-draw', sectionId: 'sec-tools', name: '绘图', icon: 'pen-tool', order: 1 },
    { id: 'sub-trans', sectionId: 'sec-tools', name: '翻译', icon: 'languages', order: 2 },
    { id: 'sub-doc', sectionId: 'sec-tools', name: '文档', icon: 'file-text', order: 3 },
    { id: 'sub-drive', sectionId: 'sec-tools', name: '网盘', icon: 'hard-drive', order: 4 },
    { id: 'sub-search', sectionId: 'sec-tools', name: '查询', icon: 'search', order: 5 },
    { id: 'sub-image', sectionId: 'sec-tools', name: '图像', icon: 'image', order: 6 },

    { id: 'sub-shopping', sectionId: 'sec-life', name: '购物', icon: 'shopping-cart', order: 0 },
    { id: 'sub-travel', sectionId: 'sec-life', name: '出行', icon: 'compass', order: 1 },

    { id: 'sub-games', sectionId: 'sec-leisure', name: '游戏', icon: 'gamepad', order: 0 },
    { id: 'sub-video', sectionId: 'sec-leisure', name: '影音', icon: 'film', order: 1 },

    { id: 'sub-dev-res', sectionId: 'sec-dev', name: '开发资源', icon: 'code', order: 0 },
    { id: 'sub-server', sectionId: 'sec-dev', name: '服务器/运维', icon: 'server', order: 1 },
  ]
}

export function defaultBookmarks(): Bookmark[] {
  const now = Date.now()
  const bookmarks: Bookmark[] = []

  // 1. 各主分类的书签库
  const categoryBookmarks: Record<string, Array<{ title: string; url: string; isFavorite?: boolean }>> = {
    'cat-prod': [
      { title: 'GitHub', url: 'https://github.com', isFavorite: true },
      { title: 'LINUX DO', url: 'https://linux.do', isFavorite: true },
      { title: 'ChatGPT', url: 'https://chatgpt.com', isFavorite: true },
      { title: 'Notion', url: 'https://notion.so', isFavorite: true },
      { title: 'V2EX', url: 'https://www.v2ex.com', isFavorite: true },
      { title: '哔哩哔哩', url: 'https://www.bilibili.com', isFavorite: true },
      { title: '语雀', url: 'https://www.yuque.com', isFavorite: true },

      { title: '163邮箱', url: 'https://mail.163.com', isFavorite: true },
      { title: 'QQ邮箱', url: 'https://mail.qq.com', isFavorite: true },
      { title: '百度网盘', url: 'https://pan.baidu.com' },
      { title: '腾讯文档', url: 'https://docs.qq.com' },
      { title: '飞书', url: 'https://www.feishu.cn' },
      { title: '知乎', url: 'https://www.zhihu.com' },
      { title: 'Google 学术', url: 'https://scholar.google.com' },

      { title: 'LeetCode 力扣', url: 'https://leetcode.cn' },
      { title: 'SimpleTex 识别', url: 'https://simpletex.cn' },
      { title: 'Excalidraw 画图', url: 'https://excalidraw.com' },
      { title: 'IT-Tools 开发者工具', url: 'https://it-tools.tech' },
      { title: 'Tailscale', url: 'https://login.tailscale.com' },
      { title: 'Canva 在线设计', url: 'https://www.canva.cn' },
      { title: '阿里云控制台', url: 'https://www.aliyun.com' },

      { title: '高德地图', url: 'https://www.amap.com' },
      { title: 'DeepL 翻译', url: 'https://www.deepl.com/translator' },
      { title: '少数派', url: 'https://sspai.com' },
      { title: '微信读书', url: 'https://weread.qq.com' },
    ],
    'cat-tech': [
      { title: 'GitHub', url: 'https://github.com' },
      { title: 'Stack Overflow', url: 'https://stackoverflow.com' },
      { title: 'MDN Web Docs', url: 'https://developer.mozilla.org' },
      { title: '掘金', url: 'https://juejin.cn' },
      { title: 'V2EX 程序员', url: 'https://www.v2ex.com/go/programmer' },
      { title: 'npm 官方仓库', url: 'https://www.npmjs.com' },
      { title: 'Docker Hub', url: 'https://hub.docker.com' },

      { title: 'Cloudflare 控制台', url: 'https://dash.cloudflare.com' },
      { title: 'Vercel 部署', url: 'https://vercel.com' },
      { title: 'Supabase 后端', url: 'https://supabase.com' },
      { title: 'LeetCode 题库', url: 'https://leetcode.cn/problemset' },
      { title: '牛客网', url: 'https://www.nowcoder.com' },
      { title: 'Codeforces 算法', url: 'https://codeforces.com' },
      { title: 'Hugging Face', url: 'https://huggingface.co' },

      { title: 'React 19 官方文档', url: 'https://react.dev' },
      { title: 'Tailwind CSS 文档', url: 'https://tailwindcss.com' },
      { title: 'TypeScript 手册', url: 'https://www.typescriptlang.org' },
      { title: 'Next.js 官方文档', url: 'https://nextjs.org' },
      { title: 'Vite 中文网', url: 'https://cn.vitejs.dev' },
      { title: 'Node.js 官方指南', url: 'https://nodejs.org' },
      { title: 'Papers with Code', url: 'https://paperswithcode.com' },
    ],
    'cat-blog': [
      { title: '阮一峰的网络日志', url: 'https://www.ruanyifeng.com/blog/' },
      { title: '酷壳 CoolShell', url: 'https://coolshell.cn' },
      { title: '少数派 sspai', url: 'https://sspai.com' },
      { title: '小林coding', url: 'https://xiaolincoding.com' },
      { title: '月光博客', url: 'https://www.williamlong.info' },
      { title: '美团技术团队', url: 'https://tech.meituan.com' },
      { title: '廖雪峰的官方网站', url: 'https://www.liaoxuefeng.com' },

      { title: 'Hacker News', url: 'https://news.ycombinator.com' },
      { title: '机器之心', url: 'https://www.jiqizhixin.com' },
      { title: '伯乐在线', url: 'http://blog.jobbole.com' },
      { title: 'V2EX 奇思妙想', url: 'https://www.v2ex.com/go/ideas' },
      { title: 'InfoQ 极客邦', url: 'https://www.infoq.cn' },
      { title: '少数派 Matrix 社区', url: 'https://sspai.com/matrix' },
      { title: '字节跳动技术团队', url: 'https://juejin.cn/user/1565318510526680' },
    ],
    'cat-study': [
      { title: 'Google 学术搜索', url: 'https://scholar.google.com' },
      { title: 'arXiv 预印本文库', url: 'https://arxiv.org' },
      { title: '中国知网 CNKI', url: 'https://www.cnki.net' },
      { title: 'Semantic Scholar', url: 'https://www.semanticscholar.org' },
      { title: '中国大学 MOOC', url: 'https://www.icourse163.org' },
      { title: '学信网', url: 'https://www.chsi.com.cn' },
      { title: '网易公开课', url: 'https://open.163.com' },

      { title: 'Coursera 在线课程', url: 'https://www.coursera.org' },
      { title: 'Kaggle 机器学习竞赛', url: 'https://www.kaggle.com' },
      { title: '哔哩哔哩公开课', url: 'https://www.bilibili.com' },
      { title: '微信读书网页版', url: 'https://weread.qq.com' },
      { title: 'Wolfram Alpha 知识计算', url: 'https://www.wolframalpha.com' },
      { title: 'CCF 计算机学会', url: 'https://www.ccf.org.cn' },
      { title: 'Overleaf 在线 LaTeX', url: 'https://www.overleaf.com' },
    ],
    'cat-tools': [
      { title: 'IT-Tools 便捷开发工具', url: 'https://it-tools.tech' },
      { title: 'TinyPNG 图像无损压缩', url: 'https://tinypng.com' },
      { title: 'Excalidraw 手绘流程白板', url: 'https://excalidraw.com' },
      { title: 'SimpleTex 拍照公式转LaTeX', url: 'https://simpletex.cn' },
      { title: 'ProcessOn 流程图与原型', url: 'https://www.processon.com' },
      { title: 'Remove.bg 智能去背景', url: 'https://www.remove.bg' },
      { title: 'Speedtest 宽带在线测速', url: 'https://www.speedtest.net' },

      { title: '草料二维码生成器', url: 'https://cli.im' },
      { title: 'Convertio 在线格式转换', url: 'https://convertio.co/zh/' },
      { title: 'Regex101 正则表达式调试', url: 'https://regex101.com' },
      { title: 'JSON 格式化校验', url: 'https://www.json.cn' },
      { title: '在线 Base64 编解码', url: 'https://base64.us' },
      { title: 'Canva 创意在线平面设计', url: 'https://www.canva.cn' },
      { title: '有道词典在线翻译', url: 'https://fanyi.youdao.com' },
    ],
    'cat-leisure': [
      { title: '哔哩哔哩 (゜-゜)つロ', url: 'https://www.bilibili.com' },
      { title: 'YouTube 视频', url: 'https://www.youtube.com' },
      { title: '网易云音乐', url: 'https://music.163.com' },
      { title: '豆瓣电影 Top250', url: 'https://movie.douban.com/top250' },
      { title: '知乎 发现更大的世界', url: 'https://www.zhihu.com' },
      { title: '小红书 标记生活', url: 'https://www.xiaohongshu.com' },
      { title: 'Steam 游戏社区', url: 'https://store.steampowered.com' },

      { title: '虎牙直播', url: 'https://www.huya.com' },
      { title: '斗鱼直播', url: 'https://www.douyu.com' },
      { title: '新浪微博热搜榜', url: 'https://weibo.com' },
      { title: 'TapTap 发现好游戏', url: 'https://www.taptap.cn' },
      { title: 'KOOK 开黑开黑语音', url: 'https://www.kookapp.cn' },
      { title: '游民星空单机游戏', url: 'https://www.gamersky.com' },
      { title: '什么值得买', url: 'https://www.smzdm.com' },
    ],
    'cat-doc': [
      { title: 'DevDocs 全栈 API 离线手册', url: 'https://devdocs.io' },
      { title: 'Linux 命令在线速查大全', url: 'https://wangchujiang.com/linux-command/' },
      { title: 'Git 官方手册与参考指南', url: 'https://git-scm.com/doc' },
      { title: 'Docker 官方架构文档', url: 'https://docs.docker.com' },
      { title: 'MDN Web 技术参考指南', url: 'https://developer.mozilla.org' },
      { title: '菜鸟教程 编程入门基础', url: 'https://www.runoob.com' },
      { title: 'Tailwind CSS 官方文档', url: 'https://tailwindcss.com/docs' },

      { title: 'W3school 基础前端手册', url: 'https://www.w3school.com.cn' },
      { title: 'Python 3 官方中文教程', url: 'https://docs.python.org/zh-cn/3/' },
      { title: 'Rust 语言圣经教程', url: 'https://course.rs' },
      { title: 'Go 语言标准库文档', url: 'https://pkg.go.dev' },
      { title: 'Nginx 核心配置速查', url: 'https://nginx.org/en/docs/' },
      { title: 'MySQL 8.0 参考手册', url: 'https://dev.mysql.com/doc/refman/8.0/en/' },
      { title: 'Vue.js 核心生态官方中文指南', url: 'https://cn.vuejs.org' },
    ],
  }

  let globalIndex = 0
  for (const [catId, items] of Object.entries(categoryBookmarks)) {
    items.forEach((item, idx) => {
      bookmarks.push({
        id: `bm-${catId}-${idx}`,
        categoryId: catId,
        title: item.title,
        url: item.url,
        order: idx,
        isFavorite: Boolean(item.isFavorite),
        createdAt: now + globalIndex++,
        updatedAt: now + globalIndex,
      })
    })
  }

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

  const docItems = [
    { title: '语雀', url: 'https://www.yuque.com' },
    { title: '腾讯文档', url: 'https://docs.qq.com' },
    { title: '石墨文档', url: 'https://shimo.im' },
    { title: '一起写', url: 'https://yiqixie.com' },
    { title: '金山文档', url: 'https://www.kdocs.cn' },
    { title: '写作猫', url: 'https://xiezuocat.com' },
    { title: '我来 wolai', url: 'https://www.wolai.com' },
    { title: 'Google文档', url: 'https://docs.google.com' },
  ]
  docItems.forEach((item, index) => {
    bookmarks.push({
      id: `bm-doc-${index}`,
      subCategoryId: 'sub-doc',
      title: item.title,
      url: item.url,
      order: index,
      createdAt: now + 400 + index,
      updatedAt: now + 400 + index,
    })
  })

  const driveItems = [
    { title: '百度网盘', url: 'https://pan.baidu.com' },
    { title: '腾讯微云', url: 'https://www.weiyun.com' },
    { title: '坚果云', url: 'https://www.jianguoyun.com' },
    { title: '阿里云盘', url: 'https://www.alipan.com' },
    { title: 'OneDrive', url: 'https://onedrive.live.com' },
    { title: '蓝奏云', url: 'https://www.lanzou.com' },
    { title: '奶牛快传', url: 'https://cowtransfer.com' },
    { title: '小鹿快传', url: 'https://deershare.com' },
  ]
  driveItems.forEach((item, index) => {
    bookmarks.push({
      id: `bm-drive-${index}`,
      subCategoryId: 'sub-drive',
      title: item.title,
      url: item.url,
      order: index,
      createdAt: now + 500 + index,
      updatedAt: now + 500 + index,
    })
  })

  const searchItems = [
    { title: '百度地图', url: 'https://map.baidu.com' },
    { title: '快递100', url: 'https://www.kuaidi100.com' },
    { title: '中国天气网', url: 'https://www.weather.com.cn' },
    { title: '百度短网址', url: 'https://dwz.cn' },
    { title: '12306', url: 'https://www.12306.cn' },
    { title: '携程机票', url: 'https://flights.ctrip.com' },
    { title: 'Speedtest测速', url: 'https://www.speedtest.net' },
    { title: '122违章查询', url: 'https://www.122.gov.cn' },
  ]
  searchItems.forEach((item, index) => {
    bookmarks.push({
      id: `bm-search-${index}`,
      subCategoryId: 'sub-search',
      title: item.title,
      url: item.url,
      order: index,
      createdAt: now + 600 + index,
      updatedAt: now + 600 + index,
    })
  })

  const imageItems = [
    { title: 'TinyPNG', url: 'https://tinypng.com' },
    { title: 'I Love Img', url: 'https://www.iloveimg.com' },
    { title: 'img.top', url: 'https://img.top' },
    { title: '稿定抠图', url: 'https://koutu.gaoding.com' },
    { title: 'Remove.bg', url: 'https://www.remove.bg' },
    { title: 'Canva', url: 'https://www.canva.cn' },
  ]
  imageItems.forEach((item, index) => {
    bookmarks.push({
      id: `bm-image-${index}`,
      subCategoryId: 'sub-image',
      title: item.title,
      url: item.url,
      order: index,
      createdAt: now + 700 + index,
      updatedAt: now + 700 + index,
    })
  })

  // 生活 -> 购物与出行
  const shoppingItems = [
    { title: '京东', url: 'https://www.jd.com' },
    { title: '淘宝', url: 'https://www.taobao.com' },
    { title: '拼多多', url: 'https://www.pinduoduo.com' },
    { title: '唯品会', url: 'https://www.vip.com' },
    { title: '什么值得买', url: 'https://www.smzdm.com' },
    { title: '网易严选', url: 'https://you.163.com' },
  ]
  shoppingItems.forEach((item, index) => {
    bookmarks.push({
      id: `bm-shop-${index}`,
      subCategoryId: 'sub-shopping',
      title: item.title,
      url: item.url,
      order: index,
      createdAt: now + 800 + index,
      updatedAt: now + 800 + index,
    })
  })

  const travelItems = [
    { title: '12306铁路售票', url: 'https://www.12306.cn' },
    { title: '高德地图出行', url: 'https://www.amap.com' },
    { title: '携程旅行机票酒店', url: 'https://www.ctrip.com' },
    { title: '飞猪度假特惠', url: 'https://www.fliggy.com' },
    { title: '去哪儿网', url: 'https://www.qunar.com' },
    { title: '马蜂窝旅游攻略', url: 'https://www.mafengwo.cn' },
  ]
  travelItems.forEach((item, index) => {
    bookmarks.push({
      id: `bm-travel-${index}`,
      subCategoryId: 'sub-travel',
      title: item.title,
      url: item.url,
      order: index,
      createdAt: now + 900 + index,
      updatedAt: now + 900 + index,
    })
  })

  // 休闲 -> 游戏与影音
  const gamesItems = [
    { title: 'Steam 游戏商城', url: 'https://store.steampowered.com' },
    { title: 'TapTap 发现好游戏', url: 'https://www.taptap.cn' },
    { title: '游民星空', url: 'https://www.gamersky.com' },
    { title: '3DM 单机游戏网', url: 'https://www.3dmgame.com' },
    { title: '机核 GCORES', url: 'https://www.gcores.com' },
    { title: '小黑盒社区', url: 'https://www.xiaoheihe.cn' },
  ]
  gamesItems.forEach((item, index) => {
    bookmarks.push({
      id: `bm-games-${index}`,
      subCategoryId: 'sub-games',
      title: item.title,
      url: item.url,
      order: index,
      createdAt: now + 1000 + index,
      updatedAt: now + 1000 + index,
    })
  })

  const videoItems = [
    { title: '哔哩哔哩 (B站)', url: 'https://www.bilibili.com' },
    { title: 'YouTube 视频', url: 'https://www.youtube.com' },
    { title: '网易云音乐在线听', url: 'https://music.163.com' },
    { title: '豆瓣电影排行榜', url: 'https://movie.douban.com' },
    { title: 'QQ音乐网页版', url: 'https://y.qq.com' },
    { title: '虎牙直播高清', url: 'https://www.huya.com' },
  ]
  videoItems.forEach((item, index) => {
    bookmarks.push({
      id: `bm-video-${index}`,
      subCategoryId: 'sub-video',
      title: item.title,
      url: item.url,
      order: index,
      createdAt: now + 1100 + index,
      updatedAt: now + 1100 + index,
    })
  })

  // 开发运维 -> 资源与服务器
  const devResItems = [
    { title: 'GitHub', url: 'https://github.com' },
    { title: 'Stack Overflow', url: 'https://stackoverflow.com' },
    { title: 'V2EX 开发者社区', url: 'https://www.v2ex.com' },
    { title: 'LINUX DO 开源社区', url: 'https://linux.do' },
    { title: 'npm 模块搜索', url: 'https://www.npmjs.com' },
    { title: 'Docker 镜像中心', url: 'https://hub.docker.com' },
  ]
  devResItems.forEach((item, index) => {
    bookmarks.push({
      id: `bm-devres-${index}`,
      subCategoryId: 'sub-dev-res',
      title: item.title,
      url: item.url,
      order: index,
      createdAt: now + 1200 + index,
      updatedAt: now + 1200 + index,
    })
  })

  const serverItems = [
    { title: '阿里云管理控制台', url: 'https://www.aliyun.com' },
    { title: '腾讯云控制台', url: 'https://cloud.tencent.com' },
    { title: 'Cloudflare 控制面板', url: 'https://dash.cloudflare.com' },
    { title: '宝塔 Linux 面板', url: 'https://www.bt.cn' },
    { title: '1Panel 开源运维面板', url: 'https://1panel.cn' },
    { title: 'Vercel 边缘部署平台', url: 'https://vercel.com' },
  ]
  serverItems.forEach((item, index) => {
    bookmarks.push({
      id: `bm-server-${index}`,
      subCategoryId: 'sub-server',
      title: item.title,
      url: item.url,
      order: index,
      createdAt: now + 1300 + index,
      updatedAt: now + 1300 + index,
    })
  })

  return bookmarks
}

export function defaultMemos(): MemoItem[] {
  const now = Date.now()
  return [
    { id: 'memo-1', text: '整理收藏夹常用工具与高效分类', done: true, createdAt: now - 3600000 * 24 },
    { id: 'memo-2', text: '体验右侧常驻工作台：草稿板与待办清单', done: true, createdAt: now - 3600000 * 12 },
    { id: 'memo-3', text: '探索番茄工作时钟与重要目标倒数日', done: false, createdAt: now - 3600000 * 4 },
    { id: 'memo-4', text: '在「全局设置」中自定义专属主题色与壁纸', done: false, createdAt: now - 3600000 },
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

export function defaultSuperPinnedLinks(): SuperPinnedLink[] {
  return [
    { id: 'pin-github', title: 'GitHub', url: 'https://github.com', order: 0 },
    { id: 'pin-chatgpt', title: 'ChatGPT', url: 'https://chatgpt.com', order: 1 },
    { id: 'pin-notion', title: 'Notion', url: 'https://notion.so', order: 2 },
    { id: 'pin-mail', title: 'Gmail', url: 'https://mail.google.com', order: 3 },
    { id: 'pin-bilibili', title: '哔哩哔哩', url: 'https://bilibili.com', order: 4 },
    { id: 'pin-v2ex', title: 'V2EX', url: 'https://v2ex.com', order: 5 },
  ]
}
