#!/usr/bin/env python3
"""
Multi-lingual RAG Metrics Tester

This script tests how different promptfoo RAG metrics perform across multiple languages.
It can be used as a provider to test metric behavior with controlled outputs.
"""

import json
import sys


def call_api(prompt, options, context):
    """
    This function simulates a RAG system that can return responses in different languages.
    It's designed to test how metrics behave with multilingual content.
    """
    
    # Extract query and context from the prompt
    query = prompt.get('query', '')
    provided_context = prompt.get('context', '')
    
    # Detect language from query (simplified detection)
    language_map = {
        'What': 'en',
        'Qué': 'es', 'Cuál': 'es',
        'Qu\'': 'fr', 'Quel': 'fr',
        'Was': 'de', 'Wie': 'de',
        '什么': 'zh', '什麼': 'zh-tw',
        '何': 'ja', 'どの': 'ja',
        'ما': 'ar',
        '무엇': 'ko', '어떤': 'ko',
        'O que': 'pt', 'Qual': 'pt',
        'क्या': 'hi',
        'מה': 'he',
        'Что': 'ru'
    }
    
    detected_lang = 'en'  # default
    for keyword, lang in language_map.items():
        if query.startswith(keyword):
            detected_lang = lang
            break
    
    # Generate responses based on language and context
    responses = {
        'en': {
            'greeting': 'Hello',
            'template': 'Based on the provided context, {content}',
            'no_info': 'The context does not contain sufficient information to answer this question.',
            'conclusion': 'This information is derived from the provided context.'
        },
        'es': {
            'greeting': 'Hola',
            'template': 'Basándome en el contexto proporcionado, {content}',
            'no_info': 'El contexto no contiene información suficiente para responder esta pregunta.',
            'conclusion': 'Esta información se deriva del contexto proporcionado.'
        },
        'fr': {
            'greeting': 'Bonjour',
            'template': 'Sur la base du contexte fourni, {content}',
            'no_info': 'Le contexte ne contient pas suffisamment d\'informations pour répondre à cette question.',
            'conclusion': 'Cette information est dérivée du contexte fourni.'
        },
        'de': {
            'greeting': 'Hallo',
            'template': 'Basierend auf dem bereitgestellten Kontext, {content}',
            'no_info': 'Der Kontext enthält nicht genügend Informationen, um diese Frage zu beantworten.',
            'conclusion': 'Diese Information stammt aus dem bereitgestellten Kontext.'
        },
        'zh': {
            'greeting': '你好',
            'template': '根据提供的上下文，{content}',
            'no_info': '上下文不包含足够的信息来回答这个问题。',
            'conclusion': '此信息来自提供的上下文。'
        },
        'ja': {
            'greeting': 'こんにちは',
            'template': '提供されたコンテキストに基づいて、{content}',
            'no_info': 'コンテキストにはこの質問に答えるのに十分な情報が含まれていません。',
            'conclusion': 'この情報は提供されたコンテキストから導き出されました。'
        },
        'ar': {
            'greeting': 'مرحبا',
            'template': 'بناءً على السياق المقدم، {content}',
            'no_info': 'لا يحتوي السياق على معلومات كافية للإجابة على هذا السؤال.',
            'conclusion': 'هذه المعلومات مستمدة من السياق المقدم.'
        },
        'ko': {
            'greeting': '안녕하세요',
            'template': '제공된 컨텍스트를 바탕으로, {content}',
            'no_info': '컨텍스트에 이 질문에 답할 충분한 정보가 없습니다.',
            'conclusion': '이 정보는 제공된 컨텍스트에서 파생되었습니다.'
        },
        'pt': {
            'greeting': 'Olá',
            'template': 'Com base no contexto fornecido, {content}',
            'no_info': 'O contexto não contém informações suficientes para responder a esta pergunta.',
            'conclusion': 'Esta informação é derivada do contexto fornecido.'
        },
        'hi': {
            'greeting': 'नमस्ते',
            'template': 'प्रदान किए गए संदर्भ के आधार पर, {content}',
            'no_info': 'संदर्भ में इस प्रश्न का उत्तर देने के लिए पर्याप्त जानकारी नहीं है।',
            'conclusion': 'यह जानकारी प्रदान किए गए संदर्भ से ली गई है।'
        }
    }
    
    # Get language-specific templates
    lang_responses = responses.get(detected_lang, responses['en'])
    
    # Extract key information from context (simplified extraction)
    if 'renewable energy' in provided_context.lower() or 'energía renovable' in provided_context.lower():
        content = extract_renewable_energy_info(provided_context, detected_lang)
    elif 'neural network' in provided_context.lower() or 'ニューラルネットワーク' in provided_context:
        content = extract_neural_network_info(provided_context, detected_lang)
    else:
        # Generic extraction based on context
        content = extract_generic_info(provided_context, detected_lang)
    
    if content:
        response = lang_responses['template'].format(content=content)
        response += ' ' + lang_responses['conclusion']
    else:
        response = lang_responses['no_info']
    
    # Include both the answer and the context for metrics that need both
    result = {
        'output': {
            'answer': response,
            'context': provided_context,
            'detected_language': detected_lang,
            'metrics_test': True
        }
    }
    
    return result


def extract_renewable_energy_info(context, lang):
    """Extract renewable energy information based on language."""
    info_map = {
        'en': 'renewable energy reduces greenhouse gas emissions and creates jobs',
        'es': 'la energía renovable reduce las emisiones de gases de efecto invernadero y crea empleos',
        'fr': 'l\'énergie renouvelable réduit les émissions de gaz à effet de serre et crée des emplois',
        'de': 'erneuerbare Energien reduzieren Treibhausgasemissionen und schaffen Arbeitsplätze',
        'zh': '可再生能源减少温室气体排放并创造就业机会',
        'ja': '再生可能エネルギーは温室効果ガスの排出を削減し、雇用を創出します',
        'ar': 'الطاقة المتجددة تقلل من انبعاثات غازات الدفيئة وتخلق فرص عمل',
        'ko': '재생 가능 에너지는 온실가스 배출을 줄이고 일자리를 창출합니다',
        'pt': 'a energia renovável reduz as emissões de gases de efeito estufa e cria empregos',
        'hi': 'नवीकरणीय ऊर्जा ग्रीनहाउस गैस उत्सर्जन को कम करती है और रोजगार सृजित करती है'
    }
    return info_map.get(lang, info_map['en'])


def extract_neural_network_info(context, lang):
    """Extract neural network information based on language."""
    info_map = {
        'en': 'neural networks use backpropagation to adjust weights through gradient descent',
        'ja': 'ニューラルネットワークは勾配降下法を通じて重みを調整するためにバックプロパゲーションを使用します',
        'zh': '神经网络使用反向传播通过梯度下降调整权重',
        'es': 'las redes neuronales usan retropropagación para ajustar pesos mediante descenso de gradiente',
        'fr': 'les réseaux de neurones utilisent la rétropropagation pour ajuster les poids par descente de gradient'
    }
    return info_map.get(lang, info_map['en'])


def extract_generic_info(context, lang):
    """Extract generic information from context."""
    # Simple extraction: return first sentence or key facts
    sentences = context.split('.')
    if sentences:
        return sentences[0].strip()
    return None


if __name__ == '__main__':
    # Read input from stdin (for testing with promptfoo)
    try:
        if len(sys.argv) > 1:
            # Command line testing mode
            test_prompt = {
                'query': sys.argv[1],
                'context': sys.argv[2] if len(sys.argv) > 2 else 'Test context'
            }
            result = call_api(test_prompt, {}, {})
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            # Read from stdin for promptfoo integration
            input_data = json.loads(sys.stdin.read())
            prompt = input_data.get('prompt', {})
            options = input_data.get('options', {})
            context = input_data.get('context', {})
            
            result = call_api(prompt, options, context)
            print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        error_result = {
            'error': str(e),
            'output': ''
        }
        print(json.dumps(error_result))
        sys.exit(1)
