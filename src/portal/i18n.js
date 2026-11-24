// Tenant page in Khmer, English or Chinese. Khmer stays the default; the choice is kept
// on the device. Landlord screens stay Khmer.
import { createContext, useContext } from 'react';
import { monthKm, dateKm, greetingKm } from '../../shared/khmer.js';

export const LANGS = [['km', 'ខ្មែរ'], ['en', 'English'], ['zh', '中文']];
const KEY = 'py-portal-lang';

export function savedLang() {
  try { const v = localStorage.getItem(KEY); if (LANGS.some(([k]) => k === v)) return v; } catch { /* private mode */ }
  return 'km';
}
export function saveLang(v) { try { localStorage.setItem(KEY, v); } catch { /* ignore */ } }

const D = {
  // splash
  splashTitle: { km: 'ជួល បង់ប្រាក់\nនិងគ្រប់គ្រងយ៉ាងងាយ', en: 'Rent, pay\nand manage with ease', zh: '租房、缴费\n轻松管理' },
  splashText: { km: 'មើលវិក្កយបត្រ បង់តាម KHQR និងកែប្រែព័ត៌មានរបស់អ្នក នៅ{p}។', en: 'See your bills, pay by KHQR and keep your details up to date at {p}.', zh: '在{p}查看账单、用 KHQR 付款并更新您的资料。' },
  start: { km: 'ចាប់ផ្តើម', en: 'Get started', zh: '开始' },
  badLink: { km: 'សូមសុំតំណ ឬ QR ថ្មីពីម្ចាស់ផ្ទះ។', en: 'Please ask your landlord for a new link or QR code.', zh: '请向房东索取新的链接或二维码。' },
  // home
  room: { km: 'បន្ទប់ {r}', en: 'Room {r}', zh: '{r} 号房' },
  heroTitle: { km: 'គ្រប់គ្រង<b>ផ្ទះជួល</b><br/><b>របស់អ្នក</b>យ៉ាងងាយ', en: 'Your <b>rental</b><br/><b>home</b>, made easy', zh: '轻松管理<br/><b>您的租房</b>' },
  home: { km: 'ទំព័រដើម', en: 'Home', zh: '首页' },
  bills: { km: 'វិក្កយបត្រ', en: 'Bills', zh: '账单' },
  me: { km: 'ខ្ញុំ', en: 'Me', zh: '我的' },
  myRoom: { km: 'បន្ទប់របស់ខ្ញុំ', en: 'My room', zh: '我的房间' },
  perMonth: { km: '/ខែ', en: '/month', zh: '/月' },
  owe: { km: 'ជំពាក់ {a}', en: 'You owe {a}', zh: '欠款 {a}' },
  noOwe: { km: '✓ គ្មានជំពាក់', en: '✓ Nothing owed', zh: '✓ 无欠款' },
  roommates: { km: '👥 រួមបន្ទប់ជាមួយ {n}', en: '👥 Sharing with {n}', zh: '👥 室友：{n}' },
  share: { km: ' · ចំណែកម្នាក់ ≈ {a}', en: ' · each ≈ {a}', zh: ' · 每人约 {a}' },
  payBill: { km: 'បង់វិក្កយបត្រ {m}', en: 'Pay the {m} bill', zh: '支付 {m} 账单' },
  seeBills: { km: 'មើលវិក្កយបត្រ', en: 'See bills', zh: '查看账单' },
  linkTg: { km: 'ភ្ជាប់ Telegram', en: 'Connect Telegram', zh: '连接 Telegram' },
  linkTgSub: { km: 'ទទួលវិក្កយបត្រ និង KHQR ដោយស្វ័យប្រវត្តិរៀងរាល់ខែ', en: 'Get your bill and KHQR automatically every month', zh: '每月自动收到账单和 KHQR' },
  sendId: { km: 'ផ្ញើរូបអត្តសញ្ញាណប័ណ្ណ', en: 'Send your ID card photo', zh: '上传身份证件照片' },
  sendIdSub: { km: 'ម្ចាស់ផ្ទះត្រូវការសម្រាប់កិច្ចសន្យា', en: 'Your landlord needs it for the contract', zh: '房东签合同需要' },
  location: { km: 'ទីតាំងផ្ទះ', en: 'Location', zh: '位置' },
  onMap: { km: 'មើលលើផែនទី', en: 'Open the map', zh: '在地图上查看' },
  lease: { km: 'កិច្ចសន្យាជួល', en: 'Rental contract', zh: '租赁合同' },
  leaseSub: { km: 'ប្រាក់កក់ {d} ខែ · បង់មុន {p} ខែ', en: 'Deposit {d} months · paid ahead {p} months', zh: '押金 {d} 个月 · 预付 {p} 个月' },
  usage: { km: 'ការប្រើប្រាស់ {m}', en: 'Usage {m}', zh: '{m} 用量' },
  water: { km: 'm³ ទឹក', en: 'm³ water', zh: 'm³ 水' },
  power: { km: 'kWh ភ្លើង', en: 'kWh power', zh: 'kWh 电' },
  // bills
  due: { km: 'ផុត {d}', en: 'due {d}', zh: '到期 {d}' },
  noBills: { km: 'មិនទាន់មានវិក្កយបត្រ', en: 'No bills yet', zh: '暂无账单' },
  paidOf: { km: 'បានបង់ {a} នៃ {b}', en: 'Paid {a} of {b}', zh: '已付 {a} / {b}' },
  waitingPay: { km: 'រង់ចាំការបង់ប្រាក់ — នឹងបញ្ជាក់ដោយស្វ័យប្រវត្តិ', en: 'Waiting for payment — confirmed automatically', zh: '等待付款 — 将自动确认' },
  khqrHint: { km: 'ថតរូបអេក្រង់ ឬស្កេនដោយកម្មវិធីធនាគារ ABA, ACLEDA, Wing, Bakong…', en: 'Take a screenshot or scan with ABA, ACLEDA, Wing, Bakong…', zh: '截图或用 ABA、ACLEDA、Wing、Bakong 等银行 App 扫码' },
  fullInvoice: { km: 'មើលវិក្កយបត្រពេញ', en: 'Full invoice', zh: '查看完整账单' },
  print: { km: 'រក្សាទុក / បោះពុម្ព', en: 'Save / print', zh: '保存 / 打印' },
  halfDue: { km: 'ពាក់កណ្តាល {a} · នៅសល់ {b}', en: 'Half by {a} · rest by {b}', zh: '一半 {a} 前 · 其余 {b} 前' },
  attachSlip: { km: 'ភ្ជាប់រូបបង្កាន់ដៃធនាគារ', en: 'Attach the bank receipt', zh: '附上银行转账截图' },
  iPaid: { km: 'ខ្ញុំបានបង់ប្រាក់', en: 'I have paid', zh: '我已付款' },
  waitConfirm: { km: '⏳ រង់ចាំបញ្ជាក់', en: '⏳ Waiting for confirmation', zh: '⏳ 等待确认' },
  paid: { km: 'បានបង់', en: 'Paid', zh: '已付' },
  paidThanks: { km: '✅ បានទទួលការបង់ប្រាក់ — សូមអរគុណ!', en: '✅ Payment received — thank you!', zh: '✅ 已收到付款 — 谢谢！' },
  slipSent: { km: 'បានផ្ញើបង្កាន់ដៃទៅម្ចាស់ផ្ទះ ✅', en: 'Receipt sent to your landlord ✅', zh: '已将收据发送给房东 ✅' },
  ownerTold: { km: 'បានជូនដំណឹងម្ចាស់ផ្ទះ ✅', en: 'Your landlord has been told ✅', zh: '已通知房东 ✅' },
  back: { km: 'ត្រឡប់', en: 'Back', zh: '返回' },
  close: { km: 'បិទ', en: 'Close', zh: '关闭' },
  // repairs
  help: { km: 'ជួសជុល', en: 'Repairs', zh: '报修' },
  helpCard: { km: 'ជួសជុល ឬផ្ញើសារ', en: 'Repairs and messages', zh: '报修和留言' },
  helpCardSub: { km: 'រាយការណ៍បញ្ហា ហើយតាមដានរហូតដល់ជួសជុលរួច', en: 'Report a problem and follow it until it is fixed', zh: '报告问题并跟进到修好为止' },
  openCount: { km: '{n} កំពុងរង់ចាំ', en: '{n} open', zh: '{n} 个处理中' },
  newRepair: { km: '🔧 រាយការណ៍ជួសជុល', en: '🔧 Report a repair', zh: '🔧 报修' },
  newMessage: { km: '💬 ផ្ញើសារម្ចាស់ផ្ទះ', en: '💬 Message the landlord', zh: '💬 给房东留言' },
  describe: { km: 'រៀបរាប់បញ្ហា (ឧ. ម៉ាស៊ីនត្រជាក់មិនត្រជាក់)', en: 'Describe the problem (e.g. the air-con is not cooling)', zh: '描述问题（例如：空调不制冷）' },
  writeMessage: { km: 'សរសេរសាររបស់អ្នក', en: 'Write your message', zh: '写下您的留言' },
  addPhoto: { km: 'ភ្ជាប់រូបភាព', en: 'Add a photo', zh: '添加照片' },
  send: { km: 'ផ្ញើ', en: 'Send', zh: '发送' },
  sending: { km: 'កំពុងផ្ញើ…', en: 'Sending…', zh: '发送中…' },
  sent: { km: '📨 បានផ្ញើទៅម្ចាស់ផ្ទះ', en: '📨 Sent to your landlord', zh: '📨 已发送给房东' },
  noRequests: { km: 'មិនទាន់មានសំណើ', en: 'No requests yet', zh: '暂无请求' },
  reply: { km: 'ឆ្លើយតប…', en: 'Reply…', zh: '回复…' },
  st_open: { km: '🟡 ថ្មី', en: '🟡 New', zh: '🟡 新' },
  st_progress: { km: '🔵 កំពុងដោះស្រាយ', en: '🔵 In progress', zh: '🔵 处理中' },
  st_done: { km: '✅ រួចរាល់', en: '✅ Done', zh: '✅ 已完成' },
  kind_maintenance: { km: '🔧 ជួសជុល', en: '🔧 Repair', zh: '🔧 报修' },
  kind_message: { km: '💬 សារ', en: '💬 Message', zh: '💬 留言' },
  landlord: { km: 'ម្ចាស់ផ្ទះ', en: 'Landlord', zh: '房东' },
  you: { km: 'អ្នក', en: 'You', zh: '您' },
  // profile
  myInfo: { km: 'ព័ត៌មានរបស់ខ្ញុំ', en: 'My details', zh: '我的资料' },
  change: { km: 'ប្តូរ', en: 'Change', zh: '更换' },
  contractUntil: { km: ' · កិច្ចសន្យាដល់ {d}', en: ' · contract until {d}', zh: ' · 合同至 {d}' },
  idCard: { km: 'អត្តសញ្ញាណប័ណ្ណ', en: 'ID card', zh: '身份证件' },
  front: { km: 'ខាងមុខ', en: 'Front', zh: '正面' },
  backSide: { km: 'ខាងក្រោយ', en: 'Back', zh: '背面' },
  privatePhotos: { km: 'រូបភាពរបស់អ្នកមើលឃើញតែដោយអ្នក និងម្ចាស់ផ្ទះប៉ុណ្ណោះ។', en: 'Only you and your landlord can see your photos.', zh: '只有您和房东能看到您的照片。' },
  personal: { km: 'ព័ត៌មានផ្ទាល់ខ្លួន', en: 'Personal details', zh: '个人资料' },
  nameKm: { km: 'ឈ្មោះ (ខ្មែរ)', en: 'Name (Khmer)', zh: '姓名（高棉文）' },
  nameEn: { km: 'ឈ្មោះ (ឡាតាំង)', en: 'Name (Latin letters)', zh: '姓名（拉丁字母）' },
  gender: { km: 'ភេទ', en: 'Sex', zh: '性别' },
  dob: { km: 'ថ្ងៃខែឆ្នាំកំណើត', en: 'Date of birth', zh: '出生日期' },
  phone: { km: 'ទូរស័ព្ទ', en: 'Phone', zh: '电话' },
  phone2: { km: 'ទូរស័ព្ទទី ២', en: 'Second phone', zh: '备用电话' },
  email: { km: 'អ៊ីមែល', en: 'Email', zh: '电子邮箱' },
  job: { km: 'មុខរបរ', en: 'Occupation', zh: '职业' },
  workplace: { km: 'កន្លែងធ្វើការ / សាលា', en: 'Workplace / school', zh: '工作单位 / 学校' },
  idDoc: { km: 'ឯកសារអត្តសញ្ញាណ', en: 'Identity document', zh: '身份证件' },
  idType: { km: 'ប្រភេទ', en: 'Type', zh: '类型' },
  idNumber: { km: 'លេខ', en: 'Number', zh: '号码' },
  idExpiry: { km: 'ថ្ងៃផុតកំណត់', en: 'Expiry date', zh: '有效期至' },
  homeAddress: { km: 'អាសយដ្ឋានអចិន្ត្រៃយ៍', en: 'Permanent address', zh: '永久地址' },
  emergency: { km: 'ទំនាក់ទំនងបន្ទាន់', en: 'Emergency contact', zh: '紧急联系人' },
  name: { km: 'ឈ្មោះ', en: 'Name', zh: '姓名' },
  relation: { km: 'ត្រូវជា', en: 'Relationship', zh: '关系' },
  save: { km: 'រក្សាទុក', en: 'Save', zh: '保存' },
  saving: { km: 'កំពុងរក្សាទុក…', en: 'Saving…', zh: '保存中…' },
  saved: { km: 'បានរក្សាទុក ✅', en: 'Saved ✅', zh: '已保存 ✅' },
  photoSent: { km: 'បានផ្ញើរូបភាព ✅', en: 'Photo sent ✅', zh: '照片已上传 ✅' },
  language: { km: 'ភាសា', en: 'Language', zh: '语言' },
  sound: { km: 'សំឡេងរូបតំណាង', en: 'Icon sounds', zh: '图标音效' },
  // contract
  signed: { km: '✅ បានចុះហត្ថលេខា', en: '✅ Signed', zh: '✅ 已签署' },
  signAgain: { km: 'កិច្ចសន្យាត្រូវបានកែប្រែ — សូមចុះហត្ថលេខាម្តងទៀត', en: 'The contract was changed — please sign again', zh: '合同已修改 — 请重新签署' },
  signTitle: { km: 'ចុះហត្ថលេខាលើកិច្ចសន្យា', en: 'Sign the contract', zh: '签署合同' },
  agree: { km: 'ខ្ញុំបានអាន និងយល់ព្រមតាមលក្ខខណ្ឌខាងលើ។', en: 'I have read and agree to the terms above.', zh: '我已阅读并同意以上条款。' },
  sign: { km: '✍️ ចុះហត្ថលេខា', en: '✍️ Sign', zh: '✍️ 签署' },
  signedThanks: { km: '✍️ បានចុះហត្ថលេខា — អរគុណ!', en: '✍️ Signed — thank you!', zh: '✍️ 已签署 — 谢谢！' },
  savePdf: { km: 'រក្សាទុក PDF / បោះពុម្ព', en: 'Save PDF / print', zh: '保存 PDF / 打印' },
  khmerContract: { km: '', en: 'The contract is in Khmer, as signed.', zh: '合同为高棉文，以签署版本为准。' },
  // meter readings
  m_water: { km: '💧 ទឹក', en: '💧 Water', zh: '💧 水' },
  m_electric: { km: '⚡ ភ្លើង', en: '⚡ Electricity', zh: '⚡ 电' },
  m_recorded: { km: '✅ បានកត់លេខកុងទ័រ', en: '✅ Meter reading saved', zh: '✅ 已记录水电表读数' },
  m_sent: { km: '📨 បានផ្ញើទៅម្ចាស់ផ្ទះ — អរគុណ!', en: '📨 Sent to your landlord — thank you!', zh: '📨 已发送给房东 — 谢谢！' },
  m_sentTitle: { km: 'បានផ្ញើលេខកុងទ័រ {m}', en: 'Meter reading sent for {m}', zh: '已提交 {m} 读数' },
  m_waitCheck: { km: 'រង់ចាំម្ចាស់ផ្ទះពិនិត្យ', en: 'Waiting for your landlord to check', zh: '等待房东核对' },
  m_send: { km: 'ផ្ញើលេខកុងទ័រ', en: 'Send meter reading', zh: '提交水电表读数' },
  m_rejected: { km: 'លេខមុនមិនត្រឹមត្រូវ — សូមផ្ញើម្តងទៀត', en: 'The last numbers were wrong — please send again', zh: '上次读数有误 — 请重新提交' },
  m_yourself: { km: 'កត់ទឹក ភ្លើង ខែ{m} ដោយខ្លួនឯង', en: 'Read your water and power meters for {m}', zh: '自行抄录 {m} 的水电表' },
  m_last: { km: 'ខែមុន {v} {u}', en: 'last month {v} {u}', zh: '上月 {v} {u}' },
  m_photo: { km: 'រូប{l}', en: 'Photo: {l}', zh: '照片：{l}' },
  m_hint: { km: '📷 ថតរូបកុងទ័រ (មិនចាំបាច់) — ជួយម្ចាស់ផ្ទះពិនិត្យបានលឿន', en: '📷 A photo of the meter (optional) helps your landlord check faster', zh: '📷 拍下电表照片（可选），方便房东快速核对' },
  cancel: { km: 'បោះបង់', en: 'Cancel', zh: '取消' },
  // invoice status, sex, ID types
  inv_paid: { km: 'បានបង់', en: 'Paid', zh: '已付' },
  inv_claimed: { km: 'រង់ចាំបញ្ជាក់', en: 'Awaiting confirmation', zh: '待确认' },
  inv_unpaid: { km: 'មិនទាន់បង់', en: 'Unpaid', zh: '未付' },
  inv_overdue: { km: 'ហួសកំណត់', en: 'Overdue', zh: '逾期' },
  inv_partial: { km: 'បង់ខ្លះ', en: 'Part paid', zh: '部分已付' },
  inv_carried: { km: 'ផ្ទេរទៅខែក្រោយ', en: 'Moved to next month', zh: '转入下月' },
  g_female: { km: 'ស្រី', en: 'Female', zh: '女' },
  g_male: { km: 'ប្រុស', en: 'Male', zh: '男' },
  g_other: { km: 'ផ្សេងៗ', en: 'Other', zh: '其他' },
  id_national_id: { km: 'អត្តសញ្ញាណប័ណ្ណសញ្ជាតិខ្មែរ', en: 'Khmer national ID card', zh: '柬埔寨身份证' },
  id_passport: { km: 'លិខិតឆ្លងដែន', en: 'Passport', zh: '护照' },
  id_family_book: { km: 'សៀវភៅគ្រួសារ', en: 'Family book', zh: '户口簿' },
  id_driving: { km: 'ប័ណ្ណបើកបរ', en: 'Driving licence', zh: '驾驶证' },
  id_other: { km: 'ផ្សេងៗ', en: 'Other', zh: '其他' },
  // rental record
  record: { km: 'ប្រវត្តិជួល', en: 'Rental record', zh: '租房记录' },
  recordSub: { km: 'ឯកសារបញ្ជាក់ពីម្ចាស់ផ្ទះ សម្រាប់បង្ហាញម្ចាស់ផ្ទះថ្មី', en: 'A record from your landlord to show your next landlord', zh: '房东出具的记录，可给下一位房东查看' },
  r_title: { km: 'ប្រវត្តិជួល', en: 'Rental record', zh: '租房记录' },
  r_issuedBy: { km: 'ចេញដោយ {p} · {d}', en: 'Issued by {p} · {d}', zh: '由 {p} 出具 · {d}' },
  r_tenant: { km: 'អ្នកជួល', en: 'Tenant', zh: '租客' },
  r_where: { km: 'ទីកន្លែង', en: 'Where', zh: '地点' },
  r_period: { km: 'រយៈពេល', en: 'Period', zh: '租期' },
  r_now: { km: 'បច្ចុប្បន្ន', en: 'now', zh: '至今' },
  r_bills: { km: 'វិក្កយបត្រ', en: 'Monthly bills', zh: '月度账单' },
  r_onTime: { km: 'បង់ទាន់ពេល', en: 'Paid on time', zh: '按时支付' },
  r_late: { km: 'បង់យឺត', en: 'Paid late', zh: '逾期支付' },
  r_unpaid: { km: 'មិនទាន់បង់', en: 'Unpaid', zh: '未支付' },
  r_owes: { km: 'នៅជំពាក់ {a}', en: 'Still owes {a}', zh: '尚欠 {a}' },
  r_nothingOwed: { km: 'គ្មានជំពាក់', en: 'Nothing owed', zh: '无欠款' },
  r_deposit: { km: 'ប្រាក់កក់ពេលចាកចេញ', en: 'Deposit at move-out', zh: '退租时押金' },
  r_depositFull: { km: '✅ បានប្រគល់វិញទាំងស្រុង ({a})', en: '✅ Returned in full ({a})', zh: '✅ 全额退还（{a}）' },
  r_depositPart: { km: 'បានប្រគល់វិញ {a} · កាត់ {b}', en: 'Returned {a} · {b} deducted', zh: '退还 {a} · 扣除 {b}' },
  r_note: { km: 'មតិម្ចាស់ផ្ទះ', en: "Landlord's note", zh: '房东备注' },
  r_score: { km: '{p}% បង់ទាន់ពេល', en: '{p}% paid on time', zh: '{p}% 按时支付' },
  r_how: { km: 'ទិន្នន័យនេះមកពីវិក្កយបត្រក្នុង «ផ្ទះយើង» ហើយម្ចាស់ផ្ទះមិនអាចកែលេខបានទេ។ មិនមានលេខអត្តសញ្ញាណប័ណ្ណ ឬលេខទូរស័ព្ទទេ។', en: 'These numbers come from the bills in Phteah Yeung; the landlord cannot edit them. No ID or phone numbers are shown.', zh: '这些数据来自 Phteah Yeung 中的账单，房东无法修改。不显示证件号码或电话号码。' },
  r_gone: { km: 'ប្រវត្តិជួលនេះមិនមាន ឬម្ចាស់ផ្ទះបានដកវិញ', en: 'This rental record does not exist or was withdrawn by the landlord', zh: '此租房记录不存在或已被房东撤回' },
  r_open: { km: 'បើក និងចែករំលែក', en: 'Open and share', zh: '打开并分享' },
};

const LOCALE = { km: 'km-KH', en: 'en-GB', zh: 'zh-CN' };

/** t(key, {vars}) for one language; falls back to Khmer. */
export function makeT(lang) {
  const t = (key, vars = {}) => {
    const e = D[key];
    let s = e ? (e[lang] ?? e.km) : key;
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
  t.lang = lang;
  /** 'YYYY-MM' → "November 2026" / "2026年11月" / Khmer. */
  t.month = (ym, khmerDigits) => (lang === 'km' ? monthKm(ym, khmerDigits)
    : new Intl.DateTimeFormat(LOCALE[lang], { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${ym}-01T00:00:00Z`)));
  t.monthShort = (ym, khmerDigits) => (lang === 'km' ? monthKm(ym, khmerDigits).replace(/ ឆ្នាំ.*/, '')
    : new Intl.DateTimeFormat(LOCALE[lang], { month: 'long', timeZone: 'UTC' }).format(new Date(`${ym}-01T00:00:00Z`)));
  /** 'YYYY-MM-DD' → a short date. */
  t.date = (ymd, khmerDigits) => (!ymd ? '' : lang === 'km' ? dateKm(ymd, khmerDigits).replace('ថ្ងៃទី', '')
    : new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${ymd.slice(0, 10)}T00:00:00Z`)));
  t.dayMonth = (ymd, khmerDigits) => (lang === 'km' ? dateKm(ymd, khmerDigits).replace('ថ្ងៃទី', '').replace(/ ឆ្នាំ.*/, '')
    : new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${ymd}T00:00:00Z`)));
  t.greeting = (hour) => (lang === 'km' ? greetingKm(hour)
    : lang === 'zh' ? (hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好')
      : (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'));
  return t;
}

/** Every key has all three languages (checked by the tests). */
export const DICTIONARY = D;

export const TCtx = createContext(makeT('km'));
export const useT = () => useContext(TCtx);
