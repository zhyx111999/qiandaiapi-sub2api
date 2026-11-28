# 千代的 NAI 小站 · API 接入指南

从创建 API Key 到完成第一条请求。站点地址：**https://api.chiyotobi.party**。本文按 2026 年 11 月 28 日的分组和接口整理；可用分组、模型及价格以你的控制台、模型广场和渠道监控为准。

## 1. 获取 API Key，开始使用

### 1.1 注册与登录

1. 打开 [千代的 NAI 小站](https://api.chiyotobi.party)，点击注册或登录，按页面提供的邮箱、GitHub 等方式完成登录。
2. 在控制台查看余额或订阅额度。付费请求需要有对应额度；具体价格请查看 [模型广场](https://api.chiyotobi.party/model-plaza)。
3. 打开左侧 **API 密钥** 页面，点击 **创建 API Key**。为密钥起一个容易识别的名称，例如 `NAI 绘图` 或 `Codex`。
4. **选择你要使用的分组**，按需设置额度、有效期等选项，然后创建并复制完整 Key。
5. 在客户端填写本节下方的地址、这个 Key，以及该分组可用的模型名。模型名可以在模型广场复制，也可通过 `GET /v1/models` 查询。

API Key 是在本站创建的调用密钥。填写客户端时使用该 Key；NAI 分组也使用本站 Key。

第一次接入建议一个 Key 对应一个分组，方便确定路由和核对用量。若页面允许多选分组，模型列表可能是多个分组的合集；实际可用接口仍取决于请求选中的平台。若管理员关闭多分组功能，已有 Key 按主分组使用。

### 1.2 地址怎么填

| 客户端要求填写的内容 | 填写值 |
| --- | --- |
| OpenAI 兼容 Base URL（通常供 Chat、Responses、Images 使用） | `https://api.chiyotobi.party/v1` |
| Anthropic / Claude 基础地址 | `https://api.chiyotobi.party` |
| Gemini 原生或 NovelAI 原生服务器地址 | `https://api.chiyotobi.party` |
| 完整接口地址 | 选择下一节列出的具体路径，拼到站点域名后 |
| API Key / Token | 刚刚在本站创建、绑定了相应分组的 Key |
| 模型名称 | 当前 Key 的模型列表里对应的完整 ID |

不同客户端对 Base URL 的定义不同：有的自动补 `/v1`，有的要求你填写。最终请求地址应只出现一次 `/v1`，例如 `/v1/chat/completions`，避免变成 `/v1/v1/chat/completions`。

### 1.3 先查询模型

下面的命令使用 Bash / Git Bash。将示例中的占位值替换为自己的 Key；Windows PowerShell 可用 `curl.exe`，并按 PowerShell 的续行语法调整命令。

```bash
export API_KEY='在这里填入你的本站_API_Key'
curl --fail-with-body 'https://api.chiyotobi.party/v1/models' \
  -H "Authorization: Bearer $API_KEY"
```

返回 JSON 的 `data[].id` 就是请求使用的模型名。查到模型表示该 Key 可见这个模型；当前是否有可用渠道，还要结合 [渠道监控](https://api.chiyotobi.party/monitor) 和实际请求判断。

## 2. 对应分组，选择对应接口格式

分组决定可使用的渠道、模型与价格；接口格式决定客户端如何发送请求。先在 Key 上选分组，再在客户端选格式。

### 2.1 分组与格式对照

以下名称来自当前站点。专属分组仅在你的账号获准后可选；分组名称变化后，以创建 Key 页面为准。

| 分组 | 推荐客户端格式 | 完整接口路径 | 请求主体 |
| --- | --- | --- | --- |
| `CC MAX`、`Kiro` | Anthropic Messages / Claude | `/v1/messages` | `model`、`max_tokens`、`messages` |
| `Codex Pro`、`012不降智可fast pro200池`、`codex5x` | OpenAI Responses / Codex | `/v1/responses` | `model`、`input` |
| 上一行分组，客户端只支持 Chat 时 | OpenAI Chat Completions | `/v1/chat/completions` | `model`、`messages` |
| `Grok Heavy` | OpenAI Chat Completions | `/v1/chat/completions` | `model`、`messages` |
| `Gemini分组` | Google Gemini 原生 | `/v1beta/models/{model}:generateContent` | `contents` |
| `GPT image(4K)`、`GPTimage(1K)` | OpenAI Images | `/v1/images/generations`；编辑使用 `/v1/images/edits` | `model`、`prompt`；编辑另带图片 |
| `NovelAI` | OpenAI Images、OpenAI Chat 或 NovelAI 原生 | 见第 3 节 | 三种格式各有自己的字段 |

Gemini 分组在文档整理时暂停调度，恢复时间以渠道监控为准。能看到分组名称不代表当时已有可调用渠道。

### 2.2 常用文本请求示例

以下 `MODEL_FROM_YOUR_KEY` 必须替换为对应分组实际返回的模型 ID。先运行第 1.3 节查询，避免照抄其他分组的模型名。

**OpenAI Chat Completions：**

```bash
curl --fail-with-body 'https://api.chiyotobi.party/v1/chat/completions' \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"MODEL_FROM_YOUR_KEY","messages":[{"role":"user","content":"你好"}],"stream":false}'
```

读取 `choices[0].message.content`。需要流式时设置 `stream: true`，按 SSE 读取 `choices[].delta`。

**OpenAI Responses：**

```bash
curl --fail-with-body 'https://api.chiyotobi.party/v1/responses' \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"MODEL_FROM_YOUR_KEY","input":"你好","stream":false}'
```

读取 `output` 中的消息内容；原始 HTTP 响应与部分 SDK 提供的 `output_text` 快捷属性不同。

**Anthropic Messages：**

```bash
curl --fail-with-body 'https://api.chiyotobi.party/v1/messages' \
  -H "x-api-key: $API_KEY" \
  -H 'anthropic-version: 2023-06-01' \
  -H 'Content-Type: application/json' \
  -d '{"model":"MODEL_FROM_YOUR_KEY","max_tokens":1024,"messages":[{"role":"user","content":"你好"}]}'
```

读取 `content` 里的文本块。客户端的 Claude 基址填站点域名，模型使用所选 Claude 分组的实际模型名。

**Gemini 原生（分组开放且 Key 有权限时）：**

```bash
export MODEL='MODEL_FROM_YOUR_KEY'
curl --fail-with-body "https://api.chiyotobi.party/v1beta/models/$MODEL:generateContent" \
  -H "x-goog-api-key: $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"contents":[{"role":"user","parts":[{"text":"你好"}]}]}'
```

读取 `candidates[].content.parts[]`。流式接口为 `:streamGenerateContent?alt=sse`。

## 3. NovelAI（NAI）格式指南

先创建绑定 **NovelAI** 分组的 Key。NAI 模型用于生成图片；Chat 兼容接口也会返回图片内容。

当前模型列表包含 `nai-diffusion-5-full`、`nai-diffusion-5-curated`、`nai-diffusion-4-5-full`、`nai-diffusion-4-5-curated`，以及相应的部分 `-inpainting` 重绘型号。每次接入都以自己的 `/v1/models` 结果为准，完整型号不能随意缩写为 `nai5` 或 `v4.5`。

### 3.1 三种格式如何选

| 场景 | 接口 | 尺寸字段 | 返回内容 |
| --- | --- | --- | --- |
| 只需要提示词、尺寸和一张图片 | `/v1/images/generations` | `"size": "832x1216"`，小写字母 `x` | JSON：`data[0].b64_json` |
| 聊天客户端，或需要步数、负面提示词、角色等参数 | `/v1/chat/completions` | 最后一条 user 消息的内层 JSON：`"size": [832, 1216]` | Markdown 图片，内含 PNG data URL |
| 已支持 NovelAI 原生协议的绘图客户端或脚本 | `/ai/generate-image`（也支持 `/v1/ai/generate-image`） | `parameters.width`、`parameters.height` | ZIP 二进制，里面是图片 |

这三种请求体不能直接互换。Images 顶层的 `prompt` 是提示词；Chat 的绘图参数放进 user 消息的 JSON 字符串；原生接口使用 `input` 和 `parameters`。

### 3.2 Images：最简单的生图请求

```bash
curl --fail-with-body 'https://api.chiyotobi.party/v1/images/generations' \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"nai-diffusion-5-full","prompt":"1girl, solo, blue hair, white dress, garden, anime illustration","size":"832x1216","n":1,"response_format":"b64_json"}' \
  -o image-response.json
```

`image-response.json` 是 JSON，不能直接改名为 PNG。保存图片：

```python
import base64
import json
from pathlib import Path

response = json.loads(Path("image-response.json").read_text(encoding="utf-8"))
Path("result.png").write_bytes(base64.b64decode(response["data"][0]["b64_json"]))
```

当前 Images 兼容接口使用 `n: 1`、`response_format: "b64_json"`。基础文生图只读取提示词、尺寸等兼容字段；需要自定义步数、负面提示词或角色参数时，使用下一节 Chat 格式或原生格式。

### 3.3 Chat：把绘图参数写成内层 JSON

保存以下内容为 `nai-chat.json`：

```json
{
  "model": "nai-diffusion-5-full",
  "stream": false,
  "messages": [
    {
      "role": "user",
      "content": "{\"prompt\":\"1girl, solo, blue hair, white dress, garden, anime illustration\",\"negative_prompt\":\"lowres, blurry, bad anatomy\",\"size\":[832,1216],\"steps\":28,\"scale\":5,\"sampler\":\"k_euler_ancestral\",\"n_samples\":1}"
    }
  ]
}
```

发送：

```bash
curl --fail-with-body 'https://api.chiyotobi.party/v1/chat/completions' \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  --data-binary @nai-chat.json \
  -o chat-response.json
```

返回的 `choices[0].message.content` 包含形如 `![...](data:image/png;base64,...)` 的 Markdown 图片。聊天客户端需支持显示 data URL 图片；脚本可以提取并保存：

```python
import base64
import json
import re
from pathlib import Path

response = json.loads(Path("chat-response.json").read_text(encoding="utf-8"))
content = response["choices"][0]["message"]["content"]
image = re.search(r"data:image/png;base64,([A-Za-z0-9+/=]+)", content)
if image is None:
    raise ValueError("响应中没有完整 PNG 图片，请检查原始响应")
Path("result.png").write_bytes(base64.b64decode(image.group(1)))
```

编程时用 `json.dumps(绘图参数)` 生成 `content` 字符串，避免手工转义。直接发送普通文字也可作为提示词，但需要精确控制参数时使用 JSON 对象。只解析**最后一条 user 消息**；历史消息不会自动变成绘图参数。

| Chat 内层字段 | 用法 |
| --- | --- |
| `prompt` | 必填，正面提示词字符串 |
| `negative_prompt` | 负面提示词字符串 |
| `size` | 两个整数的数组，例如 `[832, 1216]` |
| `steps` | 建议从 `28` 开始；超过 28 是否生效由号池当前设置决定 |
| `scale` | 建议从 `5` 开始 |
| `sampler` | 示例使用 `k_euler_ancestral` |
| `seed` | 整数；省略表示随机，不要写 `null` |
| `n_samples` | 当前 Chat 兼容接口固定为 `1` |
| `characters` | 角色提示词数组，每项至少有 `prompt`，最多 6 个角色 |
| `i2i` | 图生图对象，含 `image` 与 `strength`；与 `inpaint` 互斥 |
| `inpaint` | 重绘对象，含 `image`、`mask` 等；使用有对应重绘型号的基础模型 |
| `character_references` | 当前 Chat 转换支持 V4.5 的一张精准参考图；其他版本的原生参考功能使用对应原生客户端 |

`characters` 是文字角色描述，`character_references` 是图片参考，两者含义不同。参考图、放大、Vibe 编码等功能可能有独立费用，查看模型广场对应价表。

当 `stream: true` 时，按 SSE 拼接 `choices[].delta.content`。Chat 的流式格式不保证逐步预览生图过程，原生过程流请使用原生流式接口。

当前 Chat 兼容接口还把 `max_tokens` / `max_completion_tokens` 用作内部生成预算；一般可省略。若客户端固定发送很小的聊天输出上限，可能提示预算不足，需要在客户端调整或移除该字段。这个内部预算字段不等于本站最终账单金额。

### 3.4 NovelAI 原生格式

原生客户端若要求“服务器地址”，填 `https://api.chiyotobi.party`；若要求“完整生成接口”，填 `https://api.chiyotobi.party/ai/generate-image`。Token 仍填写 NovelAI 分组的本站 Key。

将以下内容保存为 `nai-native.json`：

```json
{
  "model": "nai-diffusion-4-5-full",
  "action": "generate",
  "input": "1girl, solo, blue hair, white dress, garden, anime illustration",
  "parameters": {
    "params_version": 3,
    "width": 832,
    "height": 1216,
    "steps": 28,
    "scale": 5,
    "sampler": "k_euler_ancestral",
    "n_samples": 1,
    "seed": 123456789,
    "negative_prompt": "lowres, blurry, bad anatomy",
    "v4_prompt": {
      "caption": {
        "base_caption": "1girl, solo, blue hair, white dress, garden, anime illustration",
        "char_captions": []
      },
      "use_coords": false,
      "use_title": false
    },
    "v4_negative_prompt": {
      "caption": {
        "base_caption": "lowres, blurry, bad anatomy",
        "char_captions": []
      },
      "use_coords": false,
      "use_title": false
    }
  }
}
```

```bash
curl --fail-with-body 'https://api.chiyotobi.party/ai/generate-image' \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  --data-binary @nai-native.json \
  -o result.zip
```

成功后解压 `result.zip` 获取 PNG。出错时返回的可能是 JSON 错误信息，需要先查看 HTTP 状态和响应内容。例子使用 V4.5；V5 等型号应使用与其版本匹配的原生参数模板。

### 3.5 原生附加功能

以下路径都接受同一 NovelAI 分组 Key，也提供对应的 `/v1` 前缀形式。

| 功能 | 方法与路径 | 使用说明 |
| --- | --- | --- |
| 原生过程流 | `POST /ai/generate-image-stream` | 使用原生生成参数；`parameters.stream` 可选 `sse` / `msgpack`，按响应的 Content-Type 解码 |
| Vibe 编码 | `POST /ai/encode-vibe` | 使用客户端生成的原生图片编码请求 |
| 放大 | `POST /ai/upscale` | 使用原生放大请求 |
| Director / 图片增强 | `POST /ai/augment-image` | 使用对应工具的原生请求 |
| 标签建议 | `GET /ai/generate-image/suggest-tags` | 由原生客户端传入查询参数 |
| 订阅兼容信息 | `GET /user/subscription` | 供客户端识别接口；显示值不代表你的本站余额 |

图片编辑兼容接口为 `POST /v1/images/edits`，使用 `multipart/form-data` 上传 `image` 文件，并提交 `model`、`prompt` 等表单字段。让客户端或 `curl -F` 自动生成 multipart boundary。

### 3.6 费用和常见问题

图片费用按当前分组与模型价卡计算，NAI 的像素档按 **宽 × 高** 选择。例如 `832 × 1216 = 1,011,712` 像素，落在不超过 `1,048,576` 像素的面积档。以模型广场展示的具体档位和用量记录为准，本文不固定价格或承诺免费。

| 现象 | 检查方法 |
| --- | --- |
| `401` / Key 无效 | 检查完整 Key、请求头，以及 Key 是否仍有效 |
| 模型不可用、平台不支持 | 确认 Key 选择的分组、接口格式和模型 ID；重新查询 `/v1/models` |
| `404` | 检查地址是否重复 `/v1`，是否拼错接口路径 |
| `400` / 参数校验失败 | 检查 Images 的字符串尺寸、Chat 的数组尺寸和 JSON 转义；查看响应中的具体错误 |
| `415` / 请求体类型不支持 | JSON 请求使用 `Content-Type: application/json`；上传文件按接口要求用 multipart |
| 图片显示成一长串字符 | Images 的 base64 需要解码；Chat 的 Markdown data URL 需要支持它的客户端 |
| 余额不足或限额已用完 | 查看本站余额、Key 的额度和有效期，并核对所选分组 |
| `429` 或暂时没有可用账号 | 查看错误信息和渠道监控；模型列表本身不保证实时容量 |

完成第一次请求后，到控制台的用量记录核对模型、实际分组、图片数量和费用。
