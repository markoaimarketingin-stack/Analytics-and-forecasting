# Frontend Integration - Clarification System

**Language**: JavaScript/React/TypeScript  
**Purpose**: Show how to integrate clarification flow in frontend  
**Status**: Ready to implement

---

## React Component Example

```jsx
import React, { useState } from 'react';

export function ForecastChat() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! I can help you forecast your marketing ROI. What would you like to know?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [clarificationContext, setClarificationContext] = useState(null);

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    // Add user message
    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: input,
          conversation_id: conversationId 
        })
      });

      const data = await response.json();

      if (data.requires_clarification) {
        // Clarification needed - ask user questions
        const assistantMessage = {
          role: 'assistant',
          content: data.reasoning,
          type: 'clarification',
          extractedSoFar: data.result.extracted_so_far
        };
        
        setMessages(prev => [...prev, assistantMessage]);
        setClarificationContext({
          questions: data.result.questions,
          conversationId: conversationId || new Date().getTime().toString()
        });
        setConversationId(conversationId || new Date().getTime().toString());
      } else {
        // Execute complete - show results
        const assistantMessage = {
          role: 'assistant',
          content: data.reasoning,
          type: 'forecast',
          result: data.result,
          payload: data.payload
        };
        
        setMessages(prev => [...prev, assistantMessage]);
        setClarificationContext(null);
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="forecast-chat">
      <div className="messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            {msg.type === 'clarification' ? (
              <div className="clarification-box">
                <div className="clarification-text">{msg.content}</div>
                {msg.extractedSoFar && Object.keys(msg.extractedSoFar).length > 0 && (
                  <div className="extracted-params">
                    <small>Understood: {Object.entries(msg.extractedSoFar)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(', ')}</small>
                  </div>
                )}
              </div>
            ) : msg.type === 'forecast' ? (
              <div className="forecast-result">
                <div className="reasoning">{msg.content}</div>
                <div className="metrics">
                  <div className="metric">
                    <span className="label">Predicted ROI:</span>
                    <span className="value">{msg.result.agent_results?.forecast?.data?.predicted_roi || 'N/A'}</span>
                  </div>
                  <div className="metric">
                    <span className="label">Predicted Revenue:</span>
                    <span className="value">${msg.result.agent_results?.forecast?.data?.predicted_revenue || 'N/A'}</span>
                  </div>
                  <div className="metric">
                    <span className="label">Predicted Profit:</span>
                    <span className="value">${msg.result.agent_results?.forecast?.data?.predicted_profit || 'N/A'}</span>
                  </div>
                  <div className="metric">
                    <span className="label">Campaign Used:</span>
                    <span className="value">{msg.payload?.channel} - {msg.payload?.campaign_type}</span>
                  </div>
                </div>
                {msg.result.agent_results?.forecast?.data?.daily_forecast && (
                  <div className="daily-forecast">
                    <h4>Daily Forecast (First 7 Days)</h4>
                    {msg.result.agent_results.forecast.data.daily_forecast.slice(0, 7).map(day => (
                      <div key={day.day} className="day-forecast">
                        <span>Day {day.day}:</span>
                        <span>${day.forecast_revenue} revenue</span>
                        <span>({day.forecast_roi * 100}% ROI)</span>
                      </div>
                    ))}
                  </div>
                )}
                {msg.result.agent_results?.forecast?.data?.top_drivers && (
                  <div className="top-drivers">
                    <h4>Top Drivers</h4>
                    {msg.result.agent_results.forecast.data.top_drivers.map(driver => (
                      <div key={driver.feature} className="driver">
                        <span>{driver.feature}</span>
                        <span className="importance">{driver.importance}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text">{msg.content}</div>
            )}
          </div>
        ))}
        {isLoading && <div className="message assistant"><div className="loading">Thinking...</div></div>}
      </div>

      <div className="input-area">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && handleSendMessage()}
          placeholder={clarificationContext 
            ? "Answer the clarification questions..." 
            : "What would you like to forecast?"}
          disabled={isLoading}
        />
        <button onClick={handleSendMessage} disabled={isLoading || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
```

---

## CSS Styling

```css
.forecast-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-width: 800px;
  margin: 0 auto;
  background: #f5f5f5;
  border-radius: 8px;
  overflow: hidden;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message {
  display: flex;
  margin-bottom: 8px;
}

.message.user {
  justify-content: flex-end;
}

.message.user > div {
  background: #007bff;
  color: white;
  padding: 12px 16px;
  border-radius: 8px;
  max-width: 70%;
  word-wrap: break-word;
}

.message.assistant {
  justify-content: flex-start;
}

.message.assistant > div {
  background: white;
  border: 1px solid #ddd;
  padding: 16px;
  border-radius: 8px;
  max-width: 70%;
}

/* Clarification styling */
.clarification-box {
  background: #fff3cd;
  border-left: 4px solid #ffc107;
  padding: 16px;
  border-radius: 4px;
}

.clarification-text {
  font-size: 14px;
  line-height: 1.6;
  color: #333;
  white-space: pre-wrap;
  margin-bottom: 12px;
}

.extracted-params {
  background: rgba(0,0,0,0.05);
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  color: #666;
}

/* Forecast result styling */
.forecast-result {
  background: #f0f8ff;
  border-left: 4px solid #007bff;
  padding: 16px;
  border-radius: 4px;
}

.reasoning {
  font-size: 14px;
  line-height: 1.6;
  margin-bottom: 16px;
  color: #333;
}

.metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

.metric {
  background: white;
  padding: 12px;
  border-radius: 4px;
  border: 1px solid #ddd;
  display: flex;
  flex-direction: column;
}

.metric .label {
  font-size: 12px;
  color: #666;
  font-weight: 500;
  margin-bottom: 4px;
}

.metric .value {
  font-size: 18px;
  font-weight: bold;
  color: #007bff;
}

/* Daily forecast */
.daily-forecast {
  margin-top: 16px;
  padding: 12px;
  background: white;
  border-radius: 4px;
}

.daily-forecast h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #333;
}

.day-forecast {
  display: grid;
  grid-template-columns: 80px 1fr 150px;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #eee;
  font-size: 12px;
}

.day-forecast:last-child {
  border-bottom: none;
}

/* Top drivers */
.top-drivers {
  margin-top: 16px;
  padding: 12px;
  background: white;
  border-radius: 4px;
}

.top-drivers h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #333;
}

.driver {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #eee;
  font-size: 12px;
}

.driver:last-child {
  border-bottom: none;
}

.driver .importance {
  font-weight: bold;
  color: #28a745;
}

/* Input area */
.input-area {
  display: flex;
  gap: 8px;
  padding: 12px;
  background: white;
  border-top: 1px solid #ddd;
}

.input-area input {
  flex: 1;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
}

.input-area input:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
}

.input-area button {
  padding: 12px 24px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
}

.input-area button:hover:not(:disabled) {
  background: #0056b3;
}

.input-area button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

/* Loading state */
.loading {
  color: #666;
  font-style: italic;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

---

## Vue.js Example

```vue
<template>
  <div class="forecast-chat">
    <div class="messages" ref="messagesContainer">
      <div v-for="(msg, idx) in messages" :key="idx" :class="['message', msg.role]">
        <component :is="getMessageComponent(msg)" :message="msg" />
      </div>
      <div v-if="isLoading" class="message assistant">
        <div class="loading">Thinking...</div>
      </div>
    </div>

    <div class="input-area">
      <input
        v-model="input"
        @keypress.enter="handleSendMessage"
        :placeholder="clarificationContext ? 'Answer the questions...' : 'What would you like to forecast?'"
        :disabled="isLoading"
      />
      <button @click="handleSendMessage" :disabled="isLoading || !input.trim()">
        Send
      </button>
    </div>
  </div>
</template>

<script>
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'ForecastChat',
  components: {
    ClarificationMessage: {
      template: `
        <div class="clarification-box">
          <div class="clarification-text">{{ message.content }}</div>
          <div v-if="extractedKeys.length > 0" class="extracted-params">
            <small>{{ extractedText }}</small>
          </div>
        </div>
      `,
      props: ['message'],
      computed: {
        extractedKeys() {
          return Object.keys(message.extractedSoFar || {});
        },
        extractedText() {
          return this.extractedKeys
            .map(k => `${k}: ${message.extractedSoFar[k]}`)
            .join(', ');
        }
      }
    },
    ForecastMessage: {
      template: `
        <div class="forecast-result">
          <div class="reasoning">{{ message.content }}</div>
          <div class="metrics">
            <div class="metric">
              <span class="label">Predicted ROI:</span>
              <span class="value">{{ getRoI }}</span>
            </div>
            <div class="metric">
              <span class="label">Revenue:</span>
              <span class="value">{{ getRevenue }}</span>
            </div>
          </div>
        </div>
      `,
      props: ['message'],
      computed: {
        getRoI() {
          return this.message.result?.agent_results?.forecast?.data?.predicted_roi || 'N/A';
        },
        getRevenue() {
          return '$' + (this.message.result?.agent_results?.forecast?.data?.predicted_revenue || 'N/A');
        }
      }
    },
    TextMessage: {
      template: `<div class="text">{{ message.content }}</div>`,
      props: ['message']
    }
  },
  data() {
    return {
      messages: [],
      input: '',
      isLoading: false,
      conversationId: null,
      clarificationContext: null
    };
  },
  methods: {
    async handleSendMessage() {
      if (!this.input.trim()) return;

      const userMessage = { role: 'user', content: this.input };
      this.messages.push(userMessage);
      this.input = '';
      this.isLoading = true;

      try {
        const response = await fetch('/api/orchestrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userMessage.content,
            conversation_id: this.conversationId
          })
        });

        const data = await response.json();

        if (data.requires_clarification) {
          this.messages.push({
            role: 'assistant',
            content: data.reasoning,
            type: 'clarification',
            extractedSoFar: data.result.extracted_so_far
          });
          this.clarificationContext = data.result;
        } else {
          this.messages.push({
            role: 'assistant',
            content: data.reasoning,
            type: 'forecast',
            result: data.result
          });
          this.clarificationContext = null;
        }
      } finally {
        this.isLoading = false;
        this.$nextTick(() => {
          this.$refs.messagesContainer.scrollTop = this.$refs.messagesContainer.scrollHeight;
        });
      }
    },
    getMessageComponent(msg) {
      if (msg.type === 'clarification') return 'ClarificationMessage';
      if (msg.type === 'forecast') return 'ForecastMessage';
      return 'TextMessage';
    }
  }
});
</script>
```

---

## Testing with Postman/curl

### Test 1: Minimal Input (Triggers Clarification)

```bash
curl -X POST http://localhost:8000/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Predict my next month ROI"
  }'
```

Expected Response:
```json
{
  "success": true,
  "requires_clarification": true,
  "result": {
    "clarification_needed": true,
    "questions": "• Which marketing channel?...",
    "extracted_so_far": {}
  }
}
```

### Test 2: Follow-up with Answers

```bash
curl -X POST http://localhost:8000/api/orchestrate \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Google Ads conversion campaign, $10k budget, 50k impressions, 2% CTR, 8% conversion"
  }'
```

Expected Response:
```json
{
  "success": true,
  "requires_clarification": false,
  "result": {
    "agent_results": {
      "forecast": {
        "status": "success",
        "data": {
          "predicted_roi": 5.82,
          "predicted_revenue": 68200,
          ...
        }
      }
    }
  }
}
```

---

## Key Integration Points

1. **Clarification Detection**
   - Check `requires_clarification` in response
   - If `true`, display `result.questions`

2. **Answer Collection**
   - Allow user to type answers
   - Include previous context in next request

3. **Result Display**
   - Extract data from `result.agent_results.forecast.data`
   - Display ROI, revenue, profit, daily forecast, top drivers

4. **Error Handling**
   - Check `success` flag
   - Display error message if needed

---

## Best Practices

✅ Clear visual distinction between questions and results  
✅ Show extracted parameters to user (confirmation)  
✅ Allow multi-line input for detailed answers  
✅ Display all forecast metrics together  
✅ Show daily forecast as table or chart  
✅ Highlight top drivers prominently  

---

**Ready to integrate?** Copy the component that matches your frontend framework! 🚀

