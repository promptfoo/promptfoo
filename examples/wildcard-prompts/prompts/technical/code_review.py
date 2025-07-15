def generate_prompt(context):
    """Generate a code review prompt"""
    language = context.get('vars', {}).get('language', 'Python')
    code = context.get('vars', {}).get('code', '')
    
    return f"""Review the following {language} code and provide feedback:

```{language.lower()}
{code}
```

Focus on:
- Code quality and best practices
- Potential bugs or issues
- Performance considerations
- Security concerns
- Suggestions for improvement""" 