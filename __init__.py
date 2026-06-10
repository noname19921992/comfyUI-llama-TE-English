# -*- coding: utf-8 -*-
"""
ComfyUI  Qwen3/Qwen3.5 llama TE 插件
"""

from .nodes import (
    QwenTE模型加载器,
    QwenTE图像推理,
    QwenTE卸载模型,
    Gemma4TE模型加载器,
    Gemma4TE图像推理,
    Gemma4TE音频推理,
    Gemma4TE卸载模型,
)

NODE_CLASS_MAPPINGS = {
    "QwenTE_ModelLoader": QwenTE模型加载器,
    "QwenTE_ImageInfer": QwenTE图像推理,
    "QwenTE_Unload": QwenTE卸载模型,
    "Gemma4TE_ModelLoader": Gemma4TE模型加载器,
    "Gemma4TE_ImageInfer": Gemma4TE图像推理,
    "Gemma4TE_AudioInfer": Gemma4TE音频推理,
    "Gemma4TE_Unload": Gemma4TE卸载模型,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "QwenTE_ModelLoader": "Qwen TE 模型加载器",
    "QwenTE_ImageInfer": "Qwen TE 图像推理",
    "QwenTE_Unload": "Qwen TE 卸载模型",
    "Gemma4TE_ModelLoader": "Gemma4 TE 模型加载器",
    "Gemma4TE_ImageInfer": "Gemma4 TE 图片推理",
    "Gemma4TE_AudioInfer": "Gemma4 TE 音频推理",
    "Gemma4TE_Unload": "Gemma4 TE 卸载模型",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
