from __future__ import annotations

from functools import lru_cache
from typing import Any

Department = str

EMPLOYEE_SEEDS: list[tuple[Department, list[str]]] = [
    (
        "Engineering",
        [
            "Arjun Sharma", "Priya Patel", "Rohan Mehta", "Sneha Iyer", "Vikram Nair",
            "Ananya Krishnan", "Karan Malhotra", "Divya Reddy", "Rahul Gupta", "Pooja Joshi",
            "Aditya Verma", "Meera Pillai", "Siddharth Rao", "Kavya Menon", "Nikhil Desai",
            "Riya Bose", "Manish Kumar", "Tanvi Shah", "Abhishek Tiwari", "Deepika Nambiar",
        ],
    ),
    (
        "Sales",
        [
            "Suresh Venkatesh", "Priyanka Chatterjee", "Amit Sinha", "Sunita Kulkarni", "Rajesh Pandey",
            "Nandini Bhatt", "Gaurav Aggarwal", "Shruti Kaur", "Vivek Saxena", "Pallavi Jain",
            "Harish Murthy", "Kritika Dubey", "Sanjay Hegde", "Roshni Puri", "Varun Chandra",
            "Ishaan Trivedi", "Neha Mishra", "Kunal Bhatia", "Swati Ghosh", "Mohan Lal",
        ],
    ),
    (
        "HR",
        [
            "Lakshmi Subramaniam", "Ashish Kapoor", "Madhu Nair", "Ravi Shankar", "Geeta Pillai",
            "Pranav Dixit", "Shweta Jaiswal", "Naresh Chaudhary", "Anjali Menon", "Dinesh Mahajan",
            "Usha Rani", "Sushil Tomar", "Rekha Bajaj", "Arun Varghese", "Poonam Srivastava",
            "Girish Patil", "Seema Khanna", "Bhavesh Parekh", "Hema Shetty", "Tarun Rastogi",
        ],
    ),
    (
        "Design",
        [
            "Nidhi Oberoi", "Samir Deshpande", "Poornima Krishnaswamy", "Chirag Thakkar", "Aarti Goswami",
            "Rohit Banerjee", "Smita Naik", "Yash Agarwal", "Preethi Suresh", "Akash Jha",
            "Vandana Raman", "Saurabh Vyas", "Lalitha Pillai", "Mihir Gandhi", "Falguni Shah",
        ],
    ),
    (
        "Finance",
        [
            "Ramesh Iyer", "Sudha Krishnamurthy", "Pavan Reddy", "Chitra Nambiar", "Sunil Dube",
            "Anita Sood", "Manoj Tripathi", "Kavitha Balakrishnan", "Sachin Wagh", "Jyoti Chauhan",
            "Hemant Pathak", "Radha Gopal", "Nitin Kulkarni", "Shobha Hegde", "Dilip Sawant",
            "Madhuri Apte", "Bhaskar Rao", "Sundar Mani", "Karuna Devi", "Prakash Nayak",
        ],
    ),
    (
        "Operations",
        ["Alpesh Modi", "Vaishali Pawar", "Rajendra Solanki", "Urvashi Mehrotra", "Ajay Thakur"],
    ),
]

DEPARTMENT_CODES: dict[Department, str] = {
    "Engineering": "ENG",
    "Sales": "SAL",
    "HR": "HRD",
    "Design": "DES",
    "Finance": "FIN",
    "Operations": "OPS",
}

DEPARTMENT_MANAGERS: dict[Department, list[int]] = {
    "Engineering": [5, 9, 13],
    "Sales": [5, 9, 13],
    "HR": [5, 9, 13],
    "Design": [5, 9],
    "Finance": [5, 9, 13],
    "Operations": [1],
}


def _employee_id(department: Department, index: int) -> str:
    return f"NOVA-{DEPARTMENT_CODES[department]}{index:03d}"


def _title(department: Department, index: int, total_in_department: int) -> str:
    if department == "Engineering":
        if index == 1:
            return "Chief Executive Officer"
        if index == total_in_department:
            return "VP Engineering"
        if index in DEPARTMENT_MANAGERS[department]:
            return "Engineering Manager"

    if department != "Engineering" and index == 1:
        if department == "Sales":
            return "VP Sales"
        if department == "HR":
            return "VP HR"
        if department == "Design":
            return "VP Design"
        if department == "Finance":
            return "VP Finance & Ops"
        if department == "Operations":
            return "Operations Manager"

    if index in DEPARTMENT_MANAGERS[department]:
        if department == "Operations":
            return "Operations Manager"
        return f"{department} Manager"

    if department == "Engineering":
        return ["Software Engineer", "Senior Engineer", "Tech Lead", "DevOps Engineer", "QA Engineer"][(index - 1) % 5]
    if department == "Sales":
        return ["Account Executive", "Sales Manager", "SDR", "Enterprise AE", "Sales Ops"][(index - 1) % 5]
    if department == "HR":
        return ["HR Business Partner", "Recruiter", "People Ops Manager", "L&D Specialist", "HRIS Analyst"][(index - 1) % 5]
    if department == "Design":
        return ["UI Designer", "UX Designer", "Design Lead", "Visual Designer", "Motion Designer"][(index - 1) % 5]
    if department == "Finance":
        return ["Financial Analyst", "Controller", "Accountant", "FP&A Manager", "Tax Specialist"][(index - 1) % 5]
    if department == "Operations":
        return ["Operations Manager", "Business Analyst", "Project Manager", "Process Engineer", "Supply Chain Analyst"][(index - 1) % 5]
    return "Employee"


def _reports_to(department: Department, index: int, total_in_department: int) -> str:
    root_id = _employee_id("Engineering", 1)
    if department == "Engineering":
        if index == 1:
            return ""
        if index == total_in_department:
            return root_id
        if index in DEPARTMENT_MANAGERS[department]:
            return _employee_id("Engineering", total_in_department)
    elif department == "Operations":
        if index == 1:
            return _employee_id("Finance", 1)
        return _employee_id("Operations", 1)
    else:
        if index == 1:
            return root_id
        if index in DEPARTMENT_MANAGERS[department]:
            return root_id

    manager_ids = [
        _employee_id(department, manager_index)
        for manager_index in DEPARTMENT_MANAGERS[department]
        if manager_index <= total_in_department
    ]
    direct_report_indices = [
        candidate_index
        for candidate_index in range(1, total_in_department + 1)
        if candidate_index != 1 and candidate_index != total_in_department and candidate_index not in DEPARTMENT_MANAGERS[department]
    ]

    if department == "Operations":
        direct_report_indices = [candidate_index for candidate_index in range(2, total_in_department + 1)]

    position = direct_report_indices.index(index)
    if manager_ids:
        return manager_ids[position % len(manager_ids)]
    return root_id


@lru_cache(maxsize=1)
def get_employee_directory() -> list[dict[str, Any]]:
    employees: list[dict[str, Any]] = []

    for department, names in EMPLOYEE_SEEDS:
        total_in_department = len(names)
        for index, name in enumerate(names, start=1):
            employee_id = _employee_id(department, index)
            employees.append(
                {
                    "employee_id": employee_id,
                    "name": name,
                    "department": department,
                    "role": _title(department, index, total_in_department),
                    "title": _title(department, index, total_in_department),
                    "reports_to": _reports_to(department, index, total_in_department),
                    "org_level": 1
                    if department == "Engineering" and index == 1
                    else 3
                    if department == "Operations" and index == 1
                    else 2
                    if (department == "Engineering" and index == total_in_department) or (department != "Engineering" and index == 1)
                    else 3
                    if index in DEPARTMENT_MANAGERS[department]
                    else 4,
                }
            )

    return employees


def get_employee_record(employee_id: str) -> dict[str, Any] | None:
    return next((record for record in get_employee_directory() if record["employee_id"] == employee_id), None)


def get_org_hierarchy_tree() -> dict[str, Any]:
    nodes = {record["employee_id"]: dict(record, children=[]) for record in get_employee_directory()}
    root: dict[str, Any] | None = None

    for record in nodes.values():
        reports_to = record.get("reports_to") or ""
        if not reports_to:
            root = record
            continue
        parent = nodes.get(str(reports_to))
        if parent is not None:
            parent.setdefault("children", []).append(record)

    if root is None:
        raise RuntimeError("Unable to resolve org hierarchy root")

    return root


def get_org_level_counts() -> dict[int, int]:
    counts = {1: 0, 2: 0, 3: 0, 4: 0}
    for record in get_employee_directory():
        counts[int(record["org_level"])] += 1
    return counts
