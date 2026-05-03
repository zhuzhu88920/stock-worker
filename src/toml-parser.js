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
    let currentArray = null;
    let arrayContent = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // 跳过注释和空行
      if (trimmed.startsWith('#') || trimmed === '') {
        continue;
      }

      // 解析股票列表数组
      if (trimmed.includes('=') && trimmed.includes('[') && !trimmed.startsWith('[')) {
        const match = trimmed.match(/^(\w+)\s*=\s*\[/);
        if (match) {
          inArray = true;
          currentArray = match[1];
          arrayContent = [];
          continue;
        }
      }

      // 数组结束
      if (inArray && trimmed === ']') {
        inArray = false;
        if (currentArray === 'cn_fund' || currentArray === 'hk' || currentArray === 'kr' || currentArray === 'us') {
          if (!config.stocks[currentArray]) {
            config.stocks[currentArray] = [];
          }
          for (const item of arrayContent) {
            const match = item.match(/"([^,]+),([^"]+)"/);
            if (match) {
              config.stocks[currentArray].push({
                code: match[1],
                name: match[2]
              });
            }
          }
        }
        currentArray = null;
        arrayContent = [];
        continue;
      }

      // 收集数组内容
      if (inArray && currentArray) {
        arrayContent.push(trimmed);
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
      } else if (currentSection === 'stocks' && currentSubsection) {
        const match = trimmed.match(/"([^,]+),([^"]+)"/);
        if (match) {
          config.stocks[currentSubsection].push({
            code: match[1],
            name: match[2]
          });
        }
      } else if (currentSection === 'markets' && currentSubsection) {
        if (trimmed.includes('=')) {
          const firstEqIndex = trimmed.indexOf('=');
          const key = trimmed.substring(0, firstEqIndex).trim();
          const value = trimmed.substring(firstEqIndex + 1).trim();
          if (!config.markets[currentSubsection]) {
            config.markets[currentSubsection] = {};
          }
          config.markets[currentSubsection][key] = this.parseValue(value);
        }
      } else if (currentSection === 'holidays' && currentSubsection) {
        if (trimmed.includes('=')) {
          const firstEqIndex = trimmed.indexOf('=');
          const key = trimmed.substring(0, firstEqIndex).trim();
          const value = trimmed.substring(firstEqIndex + 1).trim();
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
    value = value.replace(/^["']|["']$/g, '');

    const num = Number(value);
    if (!isNaN(num)) {
      return num;
    }

    if (value.startsWith('[') && value.endsWith(']')) {
      return value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
    }

    return value;
  }
}
