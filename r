Cheat Sheet মাথায় ঢুকাও
Vector
vector<int> v;
v.push_back(x);
sort(v.begin(), v.end());
Map (Frequency Count)
map<int,int> mp;
for(int x : arr)
    mp[x]++;
Binary Search
int l=0,r=n-1;
while(l<=r){
    int mid=(l+r)/2;
}
BFS
queue<int> q;
q.push(src);
visited[src]=1;

while(!q.empty()){
    int u=q.front();
    q.pop();

    for(int v:graph[u]){
        if(!visited[v]){
            visited[v]=1;
            q.push(v);
        }
    }
}
DFS
void dfs(int u){
    visited[u]=1;

    for(int v:graph[u]){
        if(!visited[v])
            dfs(v);
    }
}



Question-এ দেখলে	বুঝবে
"sorted array", "find element", "search" -	Binary Search
"minimum coins", "fewest coins" -	Coin Change DP
"visit all nodes", "traverse graph" - 	BFS / DFS
"shortest path in unweighted graph" -	BFS
"dependency", "task order", "course prerequisite" -	Topological Sort
"frequency", "count occurrences" -	Map
"sort the numbers"	- sort()

উদাহরণ:

Question:
"Given a sorted array of N integers, find whether X exists."

👉 Binary Search

Question:
"Find minimum coins needed to make amount 27 using coins {1,5,10}"

👉 Coin Change DP

Question:
"Starting from node 1, print traversal order."

👉 BFS বা DFS

Question:
"There are course dependencies. Print a valid order."

👉 Topological Sort

আরেকটা জিনিস, অনেক স্যার LeetCode বললেও question আসলে এরকম হয়:

Store N numbers and print them in sorted order.

বা

Count frequency of each number.

বা

Traverse a graph.





Case 1

"Given a sorted array of N elements, find the position of X."

তখন মাথায় আসবে:

sorted array
find/search

➡️ Binary Search template

Case 2

"Given a graph, start from node 1 and visit all reachable nodes."

➡️ BFS বা DFS template

Case 3

"Find minimum coins required to make amount K."

➡️ Coin Change template

Case 4

"Tasks have dependencies. Print a valid execution order."

➡️ Topological Sort template

Case 5

"Input N numbers and print them in ascending order."

➡️ Vector + sort()

vector<int> v;
sort(v.begin(), v.end());

তোমার বর্তমান অবস্থায় আমি যা করতাম:

একটা কাগজে লিখতাম:

SEARCH in sorted array -> Binary Search

Graph traversal -> BFS/DFS

Minimum coins/minimum steps -> DP

Dependency/Task order -> Topological Sort

Sort numbers -> sort()


