# ComfyUI Llama TE

An ultra-fast inference node for loading and running inference on Qwen / Gemma4 multimodal GGUF models within ComfyUI.


## Updates

### v3.2

- Fixed an issue where some users were forced to use CPU inference due to environment variable errors.
- Added diagnostic logs for the model loading environment; displays current Python info, `llama_cpp` location and version, and requested GPU layers to help users verify the actual runtime environment.

### v3.1
- Added a circular context progress indicator to the multi-turn conversation interface. It displays estimated token usage (used vs. remaining), the model's context limit, and current/max conversation turns. Colors change at 75% and 90% usage, and a notification appears indicating how many historical messages were trimmed due to insufficient context.
- In multi-turn conversations, the action bar for each user message and assistant reply now displays the estimated token count and the time the message was sent or completed.


### v3.0

- Added support for `Qwen3.8-VL`; allows loading the Qwen3.8 GGUF main model and its corresponding vision projector (`mmproj`) for image and text inference.
- Added `Qwen3.8 Inference Intensity` setting, supporting `xhigh`, `medium`, and `low`.
- Qwen3.8 now automatically uses the officially recommended `min_p=0.0` (this setting applies only to Qwen3.8; sampling defaults for other models remain unchanged). - Added inputs `Image 2` through `Image 8` to the `Qwen llama TE Image Inference` node; it supports the joint analysis of up to 8 images in a single inference pass, identifying them as `Image 1`, `Image 2`, etc., based on the order of connected inputs.
- When processing image inputs, the LLama TE node automatically downscales images proportionally based on their "maximum edge length" and encodes them using optimized JPEG 90 compression; this reduces the visual context footprint, inference time, and memory usage associated with large or multiple images.


### v2.0

- Added the `Qwen llama TE Multi-turn Chat` node, enabling continuous multi-turn conversations using local models within ComfyUI while maintaining conversation history.
- Added the `Qwen llama TE Skill Loader` node, allowing Skills to be loaded from the `skills` folder within the plugin directory.
- Supports both manual Skill selection and automatic Skill matching based on the initial task.
- Supports automatic reading of a Skill's `SKILL.md` file and on-demand loading of `references` files based on task requirements, minimizing irrelevant content in the context window.
- Added Skill workflow status tracking, displaying the current Skill, workflow stage, loaded reference materials, and pending options; options returned by the model can be clicked directly to continue the conversation.
- Supports requirement confirmation, stage progression, and final result marking for Skills, preventing the premature generation of final content when information is insufficient.
- Added the `h3-prompt-writing` Skill, which formats user requirements into MiniMax H3 video prompt formats (T2VA, I2VA, FL2VA, L2VA, Ref2VA).
- Enables the H3 Skill to load specific prompt rules and reference materials on demand for various modes: Text-to-Video, First Frame, First & Last Frames, and Full Reference.
- Includes built-in official H3 video creation style Skills: `3D Animation Short Generator`, `Brand Promo Short Generator`, `Two-Player Game Intro Video Generator`, `Hand-drawn/Live-action Fusion Video Generator`, `Minimalist Product Ad Generator`, `Music MV Dynamic Subtitle Generator`, `Paper Collage Explainer Animation Generator`, and `Paper Art Stop-motion Educational Video Generator`. - These style Skills support a phased confirmation process, allowing for the separate completion of creative conceptualization, asset and character design, storyboard planning, prompt engineering, and the organization of video production plans.
- The multi-turn chat interface supports copying individual messages, copying code blocks, and regenerating the assistant's last response.

### v1.0

- Added support for Gemma4 12B.

## Features

- Supports Qwen3-VL, Qwen3.5-VL, Qwen3.6-VL, and Qwen3.8-VL.
- Supports Gemma4 image-to-prompt (reverse prompting), text reasoning, and audio reasoning.
- Supports input modes for images, frame-by-frame processing, video frame sampling, and plain text.
- Supports joint input of image, audio, and text for Gemma4.
- Supports KV cache type selection (e.g., default F16 / q8_0).
- Supports CPU offloading for Qwen3.6 MoE expert weights: `cpu_moe` / `n_cpu_moe`.
- Supports Gemma4 "thinking budget" tokens to limit the generation length of the "thought" channel.
- Supports unloading the llama.cpp model synchronously when ComfyUI performs a global VRAM release.

## Installation

Place this plugin in the ComfyUI `custom_nodes` directory:

```text
ComfyUI/custom_nodes/comfyUI-llama-TE
```

```

Restart ComfyUI after updating or installing.

## Model Placement

Place the main model and mmproj files here:

```text
ComfyUI/models/LLM
```

Examples:

```text
ComfyUI/models/LLM/qwen3.6-vl-35b-a3b-q4_k_m.gguf
ComfyUI/models/LLM/mmproj-qwen3.6-vl.gguf
ComfyUI/models/LLM/Qwen3.8-27B-Q3_K_M.gguf
ComfyUI/models/LLM/Qweb3.8-mmproj-BF16.gguf
ComfyUI/models/LLM/Gemma-4-E4B-It-BF16.gguf
ComfyUI/models/LLM/mmproj-Gemma-4-E4B-It-BF16.gguf
```

## Nodes

### Qwen TE Model Loader

Used to load Qwen VL models.

Key parameters:

- `Model Series`: `Qwen3-VL`, `Qwen3.5-VL`, `Qwen3.6-VL`, `Qwen3.8-VL`.
- `Main Model`: The GGUF main model file.
- `Vision Projector (mmproj)`: Select the corresponding mmproj file for multimodal models.
- `Enable Thinking`: Controls whether the model enters reasoning/think mode.
- `Retain Think History`: Supported only by the new Qwen35ChatHandler; retains historical `<think>` content.
- `Context Length`: Corresponds to `n_ctx` in llama.cpp.
- `GPU Layers`: Corresponds to `n_gpu_layers`; `-1` usually indicates offloading as many layers as possible to the GPU.
- `KV Cache K Type` / `KV Cache V Type`: Defaults to F16; `q8_0` can be tried to reduce VRAM usage.
- `MoE Experts on CPU`: Effective only for Qwen3.6; offloads all MoE expert weights to CPU memory. - `CPU-offload for first N MoE layers`: Applies only to Qwen3.6; offloads the weights of the first N MoE layers to CPU memory.
- `Qwen3.8 Inference Intensity`: Applies only to Qwen3.8; supports `xhigh`, `medium`, and `low`. This parameter is placed at the end of the loader arguments to maintain backward compatibility with existing workflow parameter orders.

For Qwen3.8, if sampling fields remain at their default values, the system automatically selects recommended sampling settings based on the "Enable Thinking" state: `1.0 / 0.95 / 20` for Thinking mode and `0.7 / 0.80 / 20` for non-Thinking mode. Manually modified fields will not be overwritten.

> Note: `cpu_moe` / `n_cpu_moe` are primarily intended for use when VRAM is insufficient; they do not necessarily accelerate performance and may often result in slower speeds.

### Qwen TE Image Inference

Used for Qwen image captioning/analysis, video frame sampling and analysis, frame-by-frame analysis, and text-only inference.

Input Modes:

- `Image`: Supports 8 input slots (`Image` through `Image8`); the first image from each connected slot is read and sent to the model for analysis in a single inference pass.
- `Frame-by-frame`: Performs inference on each image individually.
- `Video`: Uniformly samples frames from the input image sequence and sends them to the model in a single batch.
- `Text`: No images required; performs text-only conversation.

`Max Edge Length`: Defaults to 1024. All Qwen image inputs (including multi-image and video frames) are first downscaled proportionally to this limit and then encoded using optimized Progressive JPEG 90. When downscaling occurs, the backend logs display the original dimensions, compressed dimensions, and encoded size. Higher values ​​preserve more image detail but increase visual context, inference time, and VRAM usage.

### Gemma4 TE Model Loader

Used for loading Gemma4 models.

Key Parameters:

- `Main Model`: Gemma4 GGUF main model.
- `Vision Projector (mmproj)`: Gemma4 multimodal inference requires an mmproj file. - `Enable Thinking`: The `enable_thinking` parameter for the Gemma4 handler.
- `Context Length`: Corresponds to `n_ctx`.
- `GPU Layers`: Corresponds to `n_gpu_layers`.
- `KV Cache K Type` / `KV Cache V Type`: KV cache data types.

When performing audio inference with Gemma4 E2B or E4B, using BF16 for `mmproj` is recommended; other quantization methods may degrade audio performance.

### Gemma4 TE Image Inference

Used for Gemma4 image captioning/analysis, video frame extraction and analysis, frame-by-frame analysis, and text-only inference.

Key parameters:

- `Max Edge Length`: Default is 1024.
- `Max Generated Tokens`: Controls the maximum output length.
- `Temperature` / `top_p` / `top_k`: Sampling parameters.
- `Output Think Block`: Whether to retain Gemma4's "thought" content.
- `Thinking Budget Tokens`: Limits the number of tokens in Gemma4's initial "thought" channel.

`Thinking Budget Tokens` explanation:

- `-1`: No limit.
- `0`: Terminate immediately after entering the thinking phase.
- `128 / 256 / 512`: Allows up to the specified number of thinking tokens.

### Gemma4 TE Audio Inference

Used for Gemma4 audio understanding; also supports combined inputs of image, audio, and text.

Supported inputs:

- ComfyUI `AUDIO`.
- Local WAV / MP3 file path.
- HTTP(S) WAV / MP3 URL.
- `data:audio/...;base64,...`.
- Optional ComfyUI `IMAGE` or image file path / URL.

Note: Gemma4 31B / 26BA4B typically support only Vision + Text; Gemma4 E2B / E4B are the models designed for full multimodal capabilities (Audio + Image + Text).

## General Recommendations

- If inference is slow, try reducing `Max Generated Tokens` first.
- If the model spends too long "thinking," use `Thinking Budget Tokens` set to `0`, `128`, or `256`. - If image detail is not critical, reducing the `max_side_length` from 1024 to 512 can significantly speed up image inference.
- If VRAM is limited, try using the `KV cache q8_0` setting.
- If VRAM is insufficient for Qwen3.6, try offloading MoE experts to the CPU (using options like `MoE experts on CPU` or `First N layers' experts on CPU`), though this may reduce inference speed.
- For Gemma4 audio inference, using `BF16 mmproj` is recommended.

## Troubleshooting

### Model file not found

Ensure the model is placed in:

```text
ComfyUI/models/LLM
```

After placing the file, restart ComfyUI or refresh the node list.

### Image inference error: mmproj missing

For image, audio, or multimodal inference, you must select the corresponding `vision projector (mmproj)` in the model loader.
