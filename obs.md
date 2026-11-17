ON PRESSING SUBMIT , 3 REQUESTS ARE FIRED


1./SUBMIT
https://leetcode.com/problems/maximize-score-after-zeroing-subtrees/submit/

PAYLOAD
{"lang":"cpp","question_id":"4472","typed_code":"class Solution {\npublic:\n    unordered_map<int, vector<int>> children;\n\n    long long dfs(int i, vector<int>& op, vector<int>& score) {\n        if (children[i].empty()) return score[i];\n\n        long long sum = 0;\n        long long m = LLONG_MAX;\n        for (int c : children[i]) {\n            long long val = dfs(c, op, score);\n            sum += val;\n            m = min(m, val);\n        }\n        if (op[i] == 0) m = min(m, 0LL);\n        return score[i] + sum - m;\n    }\n\n    long long maxScore(vector<int>& parent, vector<int>& op, vector<int>& score) {\n        int n = parent.size();\n        for (int i = 1; i < n; i++) {\n            children[parent[i]].push_back(i);\n        }\n        return dfs(0, op, score);\n    }\n};","solve_session_id":"dc311924-5f62-4750-b5fb-222a4fc2a596","solve_session_started_at":1794728711903,"solve_elapsed_ms":145284,"solve_rule_version":3}

RESPONSE 
{"submission_id": 2196496369}

2. https://leetcode.com/submissions/detail/2196485767/v2/check/