/**
 * 模板解析器
 * 解析推送模板配置文件
 */

import fs from 'fs';
import path from 'path';

export class TemplateParser {
  constructor(templatePath = null) {
    this.templatePath = templatePath || path.join(process.cwd(), 'push-template.toml');
    this.templates = null;
    this.nameRules = null;
  }

  /**
   * 加载模板文件
   */
  load() {
    if (!fs.existsSync(this.templatePath)) {
      throw new Error(`Template file not found: ${this.templatePath}`);
    }

    const content = fs.readFileSync(this.templatePath, 'utf-8');
    this.parse(content);
  }

  /**
   * 解析TOML内容
   */
  parse(content) {
    const lines = content.split('\n');
    this.templates = {
      title: '',
      content: {}
    };
    this.nameRules = {};

    let currentSection = null;
    let currentSubsection = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // 跳过注释和空行
      if (trimmed.startsWith('#') || trimmed === '') {
        continue;
      }

      // 解析节
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        const section = trimmed.slice(1, -1);

        if (section === 'title') {
          currentSection = 'title';
          currentSubsection = null;
        } else if (section === 'content') {
          currentSection = 'content';
          currentSubsection = null;
        } else if (section === 'name_rules') {
          currentSection = 'name_rules';
          currentSubsection = null;
        } else if (section.startsWith('content.')) {
          currentSection = 'content';
          currentSubsection = section.split('.')[1];
        } else {
          currentSection = section;
          currentSubsection = null;
        }
      } else if (trimmed.includes('=')) {
        const firstEqIndex = trimmed.indexOf('=');
        const key = trimmed.substring(0, firstEqIndex).trim();
        const value = trimmed.substring(firstEqIndex + 1).trim();

        // 去除引号
        const cleanValue = value.replace(/^["']|["']$/g, '');

        if (currentSection === 'title' && key === 'template') {
          this.templates.title = cleanValue;
        } else if (currentSection === 'content') {
          // 处理content节下的键值对
          this.templates.content[key] = cleanValue;
        } else if (currentSection === 'content' && currentSubsection) {
          this.templates.content[currentSubsection] = cleanValue;
        } else if (currentSection === 'name_rules') {
          this.nameRules[key] = cleanValue;
        }
      }
    }
  }

  /**
   * 渲染标题
   */
  renderTitle(data) {
    let template = this.templates.title;
    for (const [key, value] of Object.entries(data)) {
      template = template.replace(new RegExp(`{${key}}`, 'g'), value);
    }
    return template;
  }

  /**
   * 渲染内容
   */
  renderContent(market, data) {
    const template = this.templates.content[market] || this.templates.content.default || '';
    let result = template;
    for (const [key, value] of Object.entries(data)) {
      result = result.replace(new RegExp(`{${key}}`, 'g'), value);
    }
    return result;
  }

  /**
   * 简化名称
   */
  simplifyName(name) {
    let result = name;
    for (const [pattern, replacement] of Object.entries(this.nameRules)) {
      result = result.replace(pattern, replacement);
    }
    return result;
  }

  /**
   * 获取模板
   */
  getTemplates() {
    return this.templates;
  }

  /**
   * 获取名称规则
   */
  getNameRules() {
    return this.nameRules;
  }
}
