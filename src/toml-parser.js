/**
 * TOML解析器
 * 简化版TOML解析器
 */

export class TomlParser {
  /**
   * 解析TOML字符串
   */
  static parse(content) {
    const lines = content.split('\n');
    const config = {
      stocks: {
        cn_fund: [],
        hk: [],
        kr: [],
        us: []
      },
      markets: {},
      holidays: {}
    };

    let currentSection = null;
    let currentSubsection = null;
    let inArray = false;
    let currentArrayKey = null;
    let arrayContent = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // 跳过注释
      if (trimmed.startsWith('#')) {
        continue;
      }

      // 数组开始
      if (trimmed.includes('=') && trimmed.includes('[') && !trimmed.startsWith('[')) {
        const match = trimmed.match(/^(\w+)\s*=\s*\[/);
        if (match) {
          inArray = true;
          currentArrayKey = match[1];
          arrayContent = [];
          continue;
        }
      }

      // 数组结束
      if (inArray && trimmed === ']') {
        inArray = false;
        const parsedValue = this.parseValue(`[${arrayContent.join('')}]`);

        // 根据当前节和子节存储值
        if (currentSection === 'stocks' && currentSubsection) {
          // 股票列表特殊处理（[stocks.cn_fund] 格式）
          if (Array.isArray(parsedValue)) {
            for (const item of parsedValue) {
              if (typeof item === 'string') {
                const match = item.match(/([^,]+),(.+)/);
                if (match) {
                  config.stocks[currentSubsection].push({
                    code: match[1].trim(),
                    name: match[2].trim()
                  });
                }
              }
            }
          }
        } else if (currentSection === 'stocks' && currentArrayKey) {
          // 股票列表特殊处理（[stocks] 节下的 cn_fund = [...] 格式）
          if (Array.isArray(parsedValue)) {
            for (const item of parsedValue) {
              if (typeof item === 'string') {
                const match = item.match(/([^,]+),(.+)/);
                if (match) {
                  config.stocks[currentArrayKey].push({
                    code: match[1].trim(),
                    name: match[2].trim()
                  });
                }
              }
            }
          }
        } else if (currentSection === 'markets' && currentSubsection) {
          if (!config.markets[currentSubsection]) {
            config.markets[currentSubsection] = {};
          }
          config.markets[currentSubsection][currentArrayKey] = parsedValue;
        } else if (currentSection === 'holidays' && currentSubsection) {
          if (!config.holidays[currentSubsection]) {
            config.holidays[currentSubsection] = {};
          }
          config.holidays[currentSubsection][currentArrayKey] = parsedValue;
        }

        currentArrayKey = null;
        arrayContent = [];
        continue;
      }

      // 收集数组内容
      if (inArray) {
        // 去除行内注释
        const commentIndex = trimmed.indexOf('#');
        if (commentIndex !== -1) {
          arrayContent.push(trimmed.substring(0, commentIndex).trim());
        } else {
          arrayContent.push(trimmed);
        }
        continue;
      }

      // 解析节
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        const section = trimmed.slice(1, -1);

        if (section === 'stocks') {
          currentSection = 'stocks';
          currentSubsection = null;
        } else if (section.startsWith('stocks.')) {
          currentSection = 'stocks';
          currentSubsection = section.split('.')[1];
        } else if (section.startsWith('markets.')) {
          currentSection = 'markets';
          currentSubsection = section.split('.')[1];
        } else if (section.startsWith('holidays.')) {
          currentSection = 'holidays';
          currentSubsection = section.split('.')[1];
        } else {
          currentSection = section;
          currentSubsection = null;
        }
      } else if (trimmed.includes('=')) {
        // 处理键值对
        const firstEqIndex = trimmed.indexOf('=');
        const key = trimmed.substring(0, firstEqIndex).trim();
        const value = trimmed.substring(firstEqIndex + 1).trim();

        if (currentSection === 'stocks' && currentSubsection) {
          // 股票列表特殊处理
          const match = value.match(/"([^,]+),([^"]+)"/);
          if (match) {
            config.stocks[currentSubsection].push({
              code: match[1],
              name: match[2]
            });
          }
        } else if (currentSection === 'markets' && currentSubsection) {
          if (!config.markets[currentSubsection]) {
            config.markets[currentSubsection] = {};
          }
          config.markets[currentSubsection][key] = this.parseValue(value);
        } else if (currentSection === 'holidays' && currentSubsection) {
          if (!config.holidays[currentSubsection]) {
            config.holidays[currentSubsection] = {};
          }
          config.holidays[currentSubsection][key] = this.parseValue(value);
        }
      }
    }

    return config;
  }

  /**
   * 解析值
   */
  static parseValue(value) {
    value = value.trim();

    // 去除引号
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }

    // 数字
    const num = Number(value);
    if (!isNaN(num) && value !== '') {
      return num;
    }

    // 布尔值
    if (value === 'true') return true;
    if (value === 'false') return false;

    // 数组
    if (value.startsWith('[') && value.endsWith(']')) {
      const arrayContent = value.slice(1, -1).trim();
      if (arrayContent === '') {
        return [];
      }

      // 检查是否是对象数组（包含花括号）
      if (arrayContent.includes('{')) {
        return this.parseObjectArray(arrayContent);
      }

      // 简单数组 - 正确处理带引号的字符串
      return this.parseStringArray(arrayContent);
    }

    return value;
  }

  /**
   * 解析字符串数组
   * 正确处理带引号的字符串，例如: "a,b", "c,d"
   */
  static parseStringArray(content) {
    const result = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < content.length; i++) {
      const char = content[i];

      if ((char === '"' || char === "'") && (i === 0 || content[i - 1] !== '\\')) {
        if (!inQuotes) {
          inQuotes = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          inQuotes = false;
          quoteChar = '';
        }
        current += char;
      } else if (char === ',' && !inQuotes) {
        result.push(this.parseValue(current.trim()));
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      result.push(this.parseValue(current.trim()));
    }

    return result;
  }

  /**
   * 解析对象数组
   * 例如: [{ start = "19:00", end = "21:00" }, { start = "09:00", end = "09:30" }]
   */
  static parseObjectArray(content) {
    const objects = [];
    let current = '';
    let braceCount = 0;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];

      if (char === '{') {
        braceCount++;
        if (braceCount === 1) {
          current = '';
        } else {
          current += char;
        }
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          objects.push(this.parseObject(current.trim()));
          current = '';
        } else {
          current += char;
        }
      } else {
        if (braceCount > 0) {
          current += char;
        }
      }
    }

    return objects;
  }

  /**
   * 解析单个对象
   * 例如: start = "19:00", end = "21:00"
   */
  static parseObject(content) {
    const obj = {};
    const pairs = content.split(',');

    for (const pair of pairs) {
      const trimmed = pair.trim();
      if (!trimmed) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;

      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      obj[key] = this.parseValue(value);
    }

    return obj;
  }
}
